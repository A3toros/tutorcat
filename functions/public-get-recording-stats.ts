import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';
import { getHeaders } from './cors-headers';

const SUPABASE_BUCKET = 'tutorcat';

function parseBaseKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => !!s)
    .slice(0, 250); // safety cap
}

function toClassifierRecordingKey(baseKey: string): string {
  return `read_vs_speak:recording:${baseKey}`;
}

async function downloadFeaturesFromSupabase(baseKey: string): Promise<any | null> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY)?.trim();
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const path = `${baseKey}.features.JSON`;
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(path);
  if (error || !data) return null;
  const text = await (data as Blob).text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const handler: Handler = async (event) => {
  const headers = { ...getHeaders(event, false), 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' } as any;
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) } as any;
  }

  const baseKeys = parseBaseKeys(event.queryStringParameters?.baseKeys);
  if (baseKeys.length === 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, stats: {} }) } as any;
  }

  const sessionIdRaw = event.queryStringParameters?.sessionId;
  const sessionId = typeof sessionIdRaw === 'string' && sessionIdRaw.trim() ? sessionIdRaw.trim() : null;

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Database configuration error' }) } as any;
  }

  function clamp01(n: number): number {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function sigmoid(x: number): number {
    // numerically stable enough for small weights
    return 1 / (1 + Math.exp(-x));
  }

  function mlPredictFromFeatures(
    payload: any,
    model: { feature_names: string[]; weights: Record<string, number>; intercept: number } | null
  ): { mode: 'reading' | 'speaking'; confidence: number; spokenPct: number } | null {
    if (!model) return null;
    const whisper = payload?.whisper_verbose;
    const rhythm = payload?.browser_rhythm;
    const text: string = typeof whisper?.text === 'string' ? whisper.text : '';
    const duration: number = typeof whisper?.duration === 'number' ? whisper.duration : NaN;
    const segments: any[] = Array.isArray(whisper?.segments) ? whisper.segments : [];

    const words = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    if (!Number.isFinite(duration) || duration <= 0 || wordCount <= 0) return null;

    const wps = wordCount / duration;
    let pauseSum = 0;
    for (let i = 0; i < segments.length - 1; i++) {
      const end = Number(segments[i]?.end);
      const startNext = Number(segments[i + 1]?.start);
      if (Number.isFinite(end) && Number.isFinite(startNext)) {
        const gap = startNext - end;
        if (gap > 0) pauseSum += gap;
      }
    }
    const pauseRatio = pauseSum / duration;

    const fillerSet = new Set(['um', 'uh', 'er', 'ah', 'like']);
    let fillerCount = 0;
    for (const w of words) {
      const cleaned = w.toLowerCase().replace(/[^a-z']/g, '');
      if (fillerSet.has(cleaned)) fillerCount++;
    }
    const fillerRatio = wordCount > 0 ? fillerCount / wordCount : 0;

    const voicedRatio: number = typeof rhythm?.voiced_ratio === 'number' ? rhythm.voiced_ratio : 0.55;
    const pauseEntropy: number = typeof rhythm?.pause_entropy === 'number' ? rhythm.pause_entropy : 2.0;

    const x: Record<string, number> = {
      pause_ratio: pauseRatio,
      filler_ratio: fillerRatio,
      wps,
      voiced_ratio: voicedRatio,
      pause_entropy: pauseEntropy,
    };

    let z = model.intercept;
    for (const name of model.feature_names) {
      const w = typeof model.weights[name] === 'number' ? model.weights[name] : 0;
      const xi = typeof x[name] === 'number' ? x[name] : 0;
      z += w * xi;
    }
    const spokenProb = clamp01(sigmoid(z));
    const mode: 'reading' | 'speaking' = spokenProb >= 0.5 ? 'speaking' : 'reading';
    const confidence = clamp01(Math.abs(spokenProb - 0.5) * 2);
    return { mode, confidence, spokenPct: Math.round(spokenProb * 100) };
  }

  function baselineFromFeatures(payload: any): { mode: 'reading' | 'speaking'; confidence: number; spokenPct: number } | null {
    const whisper = payload?.whisper_verbose;
    const rhythm = payload?.browser_rhythm;
    const text: string = typeof whisper?.text === 'string' ? whisper.text : '';
    const duration: number = typeof whisper?.duration === 'number' ? whisper.duration : NaN;
    const segments: any[] = Array.isArray(whisper?.segments) ? whisper.segments : [];

    const words = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    if (!Number.isFinite(duration) || duration <= 0 || wordCount <= 0) return null;

    // Whisper-derived features
    const wps = wordCount / duration;
    let pauseSum = 0;
    for (let i = 0; i < segments.length - 1; i++) {
      const end = Number(segments[i]?.end);
      const startNext = Number(segments[i + 1]?.start);
      if (Number.isFinite(end) && Number.isFinite(startNext)) {
        const gap = startNext - end;
        if (gap > 0) pauseSum += gap;
      }
    }
    const pauseRatio = pauseSum / duration;

    const fillerSet = new Set(['um', 'uh', 'er', 'ah', 'like']);
    let fillerCount = 0;
    for (const w of words) {
      const cleaned = w.toLowerCase().replace(/[^a-z']/g, '');
      if (fillerSet.has(cleaned)) fillerCount++;
    }
    const fillerRatio = wordCount > 0 ? fillerCount / wordCount : 0;

    // Browser rhythm features (optional)
    const voicedRatio: number = typeof rhythm?.voiced_ratio === 'number' ? rhythm.voiced_ratio : NaN;
    const pauseEntropy: number = typeof rhythm?.pause_entropy === 'number' ? rhythm.pause_entropy : NaN;

    // Heuristic "spoken" score: higher means more spontaneous speaking.
    // Intuition:
    // - More pauses and fillers => more spontaneous
    // - Very high wps and very low pauses => more reading
    // - Higher voiced_ratio (continuous voicing) trends reading, but weak signal
    let z = 0;
    z += 2.2 * (pauseRatio - 0.10);
    z += 2.0 * (fillerRatio - 0.01);
    z += 0.25 * ((Number.isFinite(pauseEntropy) ? pauseEntropy : 2.0) - 2.0);
    z += -1.6 * (wps - 2.3);
    z += -0.8 * ((Number.isFinite(voicedRatio) ? voicedRatio : 0.55) - 0.55);

    const spokenProb = clamp01(sigmoid(z));
    const mode: 'reading' | 'speaking' = spokenProb >= 0.5 ? 'speaking' : 'reading';
    const confidence = clamp01(Math.abs(spokenProb - 0.5) * 2);
    return { mode, confidence, spokenPct: Math.round(spokenProb * 100) };
  }

  try {
    const sql = neon(databaseUrl);
    const rows = await sql`
      SELECT
        base_key,
        reading_count,
        speaking_count,
        not_sure_count,
        ai_count,
        google_translate_count
      FROM recording_button_stats
      WHERE base_key = ANY(${baseKeys}::text[])
    `;

    const classifierKeys = baseKeys.map(toClassifierRecordingKey);
    const featureRows = await sql`
      SELECT key, payload
      FROM classifier_store
      WHERE kind = 'recording' AND key = ANY(${classifierKeys}::text[])
    `;
    const featuresByKey = new Map<string, any>();
    for (const r of featureRows as any[]) {
      const key = typeof r?.key === 'string' ? r.key : '';
      const m = key.match(/^read_vs_speak:recording:(.+)$/);
      const baseKey = m?.[1];
      if (baseKey) featuresByKey.set(baseKey, r.payload?.features);
    }

    // If we don't have cached features, fall back to Supabase download (so we can predict before any votes).
    // Also opportunistically cache into classifier_store for speed next time.
    const missing = baseKeys.filter((k) => !featuresByKey.has(k)).slice(0, 50);
    if (missing.length > 0) {
      const downloaded = await Promise.all(
        missing.map(async (k) => {
          const feats = await downloadFeaturesFromSupabase(k);
          return { baseKey: k, feats };
        })
      );
      for (const { baseKey, feats } of downloaded) {
        if (!feats) continue;
        featuresByKey.set(baseKey, feats);
        try {
          await sql`
            INSERT INTO classifier_store (key, kind, payload, updated_at)
            VALUES (
              ${toClassifierRecordingKey(baseKey)},
              'recording',
              ${JSON.stringify({ storage_filename: `${baseKey}.features.JSON`, features: feats })}::jsonb,
              NOW()
            )
            ON CONFLICT (key) DO UPDATE SET
              payload = EXCLUDED.payload,
              updated_at = NOW()
          `;
        } catch {
          // ignore cache failures
        }
      }
    }

    const modelRows = await sql`
      SELECT payload
      FROM classifier_store
      WHERE key = 'read_vs_speak:model:v1' AND kind = 'model'
      LIMIT 1
    `;
    const modelPayload = (modelRows as any[])[0]?.payload;
    const liveModel =
      modelPayload && typeof modelPayload === 'object'
        ? {
            feature_names: Array.isArray((modelPayload as any).feature_names) ? ((modelPayload as any).feature_names as string[]) : [],
            weights:
              (modelPayload as any).weights && typeof (modelPayload as any).weights === 'object'
                ? ((modelPayload as any).weights as Record<string, number>)
                : {},
            intercept: typeof (modelPayload as any).intercept === 'number' ? ((modelPayload as any).intercept as number) : 0,
            samples_seen: typeof (modelPayload as any).samples_seen === 'number' ? ((modelPayload as any).samples_seen as number) : 0,
          }
        : null;

    // Per-session vote history for the items on this page (so UI can disable after vote)
    const sessionVotes: Record<string, { mode?: string; suspect?: { ai?: boolean; google_translate?: boolean } }> = {};
    if (sessionId) {
      const voteRows = await sql`
        SELECT base_key, "group", choice
        FROM recording_button_events
        WHERE session_id = ${sessionId} AND base_key = ANY(${baseKeys}::text[])
        ORDER BY created_at DESC
        LIMIT 2000
      `;

      for (const r of voteRows as any[]) {
        const baseKey = typeof r?.base_key === 'string' ? r.base_key : null;
        const group = typeof r?.group === 'string' ? r.group : null;
        const choice = typeof r?.choice === 'string' ? r.choice : null;
        if (!baseKey || !group || !choice) continue;

        if (!sessionVotes[baseKey]) sessionVotes[baseKey] = {};

        if (group === 'mode') {
          // lock to first mode choice (most recent event wins due to DESC order)
          if (!sessionVotes[baseKey].mode) sessionVotes[baseKey].mode = choice;
        } else if (group === 'suspect') {
          if (!sessionVotes[baseKey].suspect) sessionVotes[baseKey].suspect = {};
          if (choice === 'ai') sessionVotes[baseKey].suspect!.ai = true;
          if (choice === 'google_translate') sessionVotes[baseKey].suspect!.google_translate = true;
        }
      }
    }

    const stats: Record<string, any> = {};
    for (const r of rows as any[]) {
      const reading = Number(r.reading_count || 0);
      const speaking = Number(r.speaking_count || 0);
      const notSure = Number(r.not_sure_count || 0);
      const ai = Number(r.ai_count || 0);
      const googleTranslate = Number(r.google_translate_count || 0);

      const totalMode = reading + speaking + notSure;
      const modePairs: Array<[string, number]> = [
        ['reading', reading],
        ['speaking', speaking],
        ['not_sure', notSure],
      ];
      modePairs.sort((a, b) => b[1] - a[1]);
      const [modePrediction, modeVotes] = modePairs[0] || ['not_sure', 0];
      const modeConfidence = totalMode > 0 ? modeVotes / totalMode : 0;

      const totalSuspect = ai + googleTranslate;
      const suspectRate = totalMode + totalSuspect > 0 ? totalSuspect / (totalMode + totalSuspect) : 0;

      const feats = featuresByKey.get(r.base_key);
      const baseline = baselineFromFeatures(feats);
      const ml = liveModel && liveModel.samples_seen >= 20 ? mlPredictFromFeatures(feats, liveModel) : null;

      stats[r.base_key] = {
        reading,
        speaking,
        not_sure: notSure,
        ai,
        google_translate: googleTranslate,
        prediction: {
          mode: modePrediction,
          confidence: modeConfidence,
          votes: totalMode,
          suspectRate,
        },
        baseline,
        ml,
      };
    }

    // Ensure missing keys still show up as zeros
    for (const k of baseKeys) {
      if (!stats[k]) {
        const feats = featuresByKey.get(k);
        const baseline = baselineFromFeatures(feats);
        const ml = liveModel && liveModel.samples_seen >= 20 ? mlPredictFromFeatures(feats, liveModel) : null;
        stats[k] = {
          reading: 0,
          speaking: 0,
          not_sure: 0,
          ai: 0,
          google_translate: 0,
          prediction: { mode: 'not_sure', confidence: 0, votes: 0, suspectRate: 0 },
          baseline,
          ml,
        };
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, stats, sessionVotes }) } as any;
  } catch (e) {
    console.error('public-get-recording-stats error', e);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: (e as Error).message }) } as any;
  }
};

