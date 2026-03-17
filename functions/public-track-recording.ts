import { Handler } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';
import { getHeaders } from './cors-headers';

type Group = 'mode' | 'suspect';

const SUPABASE_BUCKET = 'tutorcat';

const MODE_CHOICES = new Set(['reading', 'speaking', 'not_sure']);
const SUSPECT_CHOICES = new Set(['ai', 'google_translate']);

function normalizeChoice(group: Group, choiceRaw: string): string | null {
  const c = (choiceRaw || '').trim().toLowerCase();
  if (group === 'mode') {
    if (c === 'not sure') return 'not_sure';
    return MODE_CHOICES.has(c) ? c : null;
  }
  if (group === 'suspect') {
    if (c === 'google translate') return 'google_translate';
    if (c === 'google_translate') return 'google_translate';
    return SUSPECT_CHOICES.has(c) ? c : null;
  }
  return null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function extractLiveFeatures(payload: any): { pause_ratio: number; filler_ratio: number; wps: number; voiced_ratio: number; pause_entropy: number } | null {
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
  const pause_ratio = pauseSum / duration;

  const fillerSet = new Set(['um', 'uh', 'er', 'ah', 'like']);
  let fillerCount = 0;
  for (const w of words) {
    const cleaned = w.toLowerCase().replace(/[^a-z']/g, '');
    if (fillerSet.has(cleaned)) fillerCount++;
  }
  const filler_ratio = wordCount > 0 ? fillerCount / wordCount : 0;

  const voiced_ratio: number = typeof rhythm?.voiced_ratio === 'number' ? rhythm.voiced_ratio : 0.55;
  const pause_entropy: number = typeof rhythm?.pause_entropy === 'number' ? rhythm.pause_entropy : 2.0;

  return { pause_ratio, filler_ratio, wps, voiced_ratio, pause_entropy };
}

async function downloadFeaturesFromSupabase(baseKey: string): Promise<any | null> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY)?.trim();
  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const path = `${baseKey}.features.JSON`;
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(path);
    if (error || !data) return null;
    const text = await (data as Blob).text();
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
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) } as any;
  }

  let body: any = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid JSON payload' }) } as any;
  }

  const baseKey = typeof body.baseKey === 'string' ? body.baseKey.trim() : '';
  const group = typeof body.group === 'string' ? (body.group.trim() as Group) : null;
  const choiceRaw = typeof body.choice === 'string' ? body.choice : '';
  const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : null;

  if (!baseKey) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing baseKey' }) } as any;
  }
  if (group !== 'mode' && group !== 'suspect') {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid group' }) } as any;
  }
  const choice = normalizeChoice(group, choiceRaw);
  if (!choice) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid choice' }) } as any;
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Database configuration error' }) } as any;
  }

  try {
    const sql = neon(databaseUrl);

    // 1) Immutable event log
    await sql`
      INSERT INTO recording_button_events (base_key, "group", choice, session_id, created_at)
      VALUES (${baseKey}, ${group}, ${choice}, ${sessionId}, NOW())
    `;

    // 2) Aggregate stats increment (atomic upsert)
    const inc = {
      reading: group === 'mode' && choice === 'reading' ? 1 : 0,
      speaking: group === 'mode' && choice === 'speaking' ? 1 : 0,
      not_sure: group === 'mode' && choice === 'not_sure' ? 1 : 0,
      ai: group === 'suspect' && choice === 'ai' ? 1 : 0,
      google_translate: group === 'suspect' && choice === 'google_translate' ? 1 : 0,
    };

    await sql`
      INSERT INTO recording_button_stats (
        base_key,
        reading_count,
        speaking_count,
        not_sure_count,
        ai_count,
        google_translate_count,
        updated_at
      ) VALUES (
        ${baseKey},
        ${inc.reading},
        ${inc.speaking},
        ${inc.not_sure},
        ${inc.ai},
        ${inc.google_translate},
        NOW()
      )
      ON CONFLICT (base_key) DO UPDATE SET
        reading_count = recording_button_stats.reading_count + EXCLUDED.reading_count,
        speaking_count = recording_button_stats.speaking_count + EXCLUDED.speaking_count,
        not_sure_count = recording_button_stats.not_sure_count + EXCLUDED.not_sure_count,
        ai_count = recording_button_stats.ai_count + EXCLUDED.ai_count,
        google_translate_count = recording_button_stats.google_translate_count + EXCLUDED.google_translate_count,
        updated_at = NOW()
    `;

    // 3) Live training: update online read-vs-speak model from teacher vote (reading/speaking only).
    if (group === 'mode' && (choice === 'reading' || choice === 'speaking')) {
      try {
        console.log('[LIVE-TRAIN] vote received', { baseKey, choice, sessionId: sessionId ? 'present' : 'none' });
        const featureRows = await sql`
          SELECT payload
          FROM classifier_store
          WHERE key = ${`read_vs_speak:recording:${baseKey}`} AND kind = 'recording'
          LIMIT 1
        `;
        const recordingPayload = (featureRows as any[])[0]?.payload;
        const hadCachedFeatures = !!recordingPayload?.features;
        const features = recordingPayload?.features || (await downloadFeaturesFromSupabase(baseKey));
        console.log('[LIVE-TRAIN] features', { baseKey, source: hadCachedFeatures ? 'classifier_store' : 'supabase_or_missing', ok: !!features });
        const feats = extractLiveFeatures(features);
        if (feats) {
          console.log('[LIVE-TRAIN] extracted features', { baseKey, ...feats });
          // Best-effort cache so future votes don't need another download
          if (!recordingPayload?.features && features) {
            try {
              await sql`
                INSERT INTO classifier_store (key, kind, payload, updated_at)
                VALUES (
                  ${`read_vs_speak:recording:${baseKey}`},
                  'recording',
                  ${JSON.stringify({ storage_filename: `${baseKey}.features.JSON`, features })}::jsonb,
                  NOW()
                )
                ON CONFLICT (key) DO UPDATE SET
                  payload = EXCLUDED.payload,
                  updated_at = NOW()
              `;
              console.log('[LIVE-TRAIN] cached features into classifier_store', { baseKey });
            } catch {
              // ignore cache failures
              console.log('[LIVE-TRAIN] failed to cache features (ignored)', { baseKey });
            }
          }

          // Transaction + row lock to avoid concurrent weight clobbering.
          await sql`BEGIN`;
          const modelRows = await sql`
            SELECT payload
            FROM classifier_store
            WHERE key = 'read_vs_speak:model:v1' AND kind = 'model'
            FOR UPDATE
          `;
          const modelRow = (modelRows as any[])[0]?.payload;
          if (modelRow && typeof modelRow === 'object') {
            const featureNames: string[] = Array.isArray((modelRow as any).feature_names) ? (modelRow as any).feature_names : [];
            const weightsObj: Record<string, number> =
              (modelRow as any).weights && typeof (modelRow as any).weights === 'object'
                ? ((modelRow as any).weights as Record<string, number>)
                : {};
            const intercept: number = typeof (modelRow as any).intercept === 'number' ? (modelRow as any).intercept : 0;
            const lr: number = typeof (modelRow as any).learning_rate === 'number' ? (modelRow as any).learning_rate : 0.15;
            const l2: number = typeof (modelRow as any).l2 === 'number' ? (modelRow as any).l2 : 0.001;
            const samplesSeen: number = typeof (modelRow as any).samples_seen === 'number' ? (modelRow as any).samples_seen : 0;
            console.log('[LIVE-TRAIN] model loaded', { samplesSeen, lr, l2, featureNames });

            // Build x vector in fixed order
            const x: Record<string, number> = {
              pause_ratio: feats.pause_ratio,
              filler_ratio: feats.filler_ratio,
              wps: feats.wps,
              voiced_ratio: feats.voiced_ratio,
              pause_entropy: feats.pause_entropy,
            };

            let z = intercept;
            for (const name of featureNames) {
              const w = typeof weightsObj[name] === 'number' ? weightsObj[name] : 0;
              const xi = typeof x[name] === 'number' ? x[name] : 0;
              z += w * xi;
            }
            const p = clamp01(sigmoid(z)); // p(spoken)
            const y = choice === 'speaking' ? 1 : 0;
            const err = p - y;
            console.log('[LIVE-TRAIN] step', { baseKey, y, p: Number(p.toFixed(4)), err: Number(err.toFixed(4)) });

            const nextWeights: Record<string, number> = { ...weightsObj };
            for (const name of featureNames) {
              const w = typeof weightsObj[name] === 'number' ? weightsObj[name] : 0;
              const xi = typeof x[name] === 'number' ? x[name] : 0;
              const grad = err * xi + l2 * w;
              nextWeights[name] = w - lr * grad;
            }
            const nextIntercept = intercept - lr * err;

            await sql`
              UPDATE classifier_store
              SET payload = ${JSON.stringify({
                ...modelRow,
                weights: nextWeights,
                intercept: nextIntercept,
                samples_seen: samplesSeen + 1,
              })}::jsonb,
                  updated_at = NOW()
              WHERE key = 'read_vs_speak:model:v1' AND kind = 'model'
            `;
            console.log('[LIVE-TRAIN] model updated', { samplesSeenAfter: samplesSeen + 1 });
          }
          await sql`COMMIT`;
        }
      } catch (e) {
        try {
          await sql`ROLLBACK`;
        } catch {
          // ignore
        }
        console.error('public-track-recording live training error', e);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) } as any;
  } catch (e) {
    console.error('public-track-recording error', e);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: (e as Error).message }) } as any;
  }
};

