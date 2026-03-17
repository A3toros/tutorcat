import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { neon } from '@neondatabase/serverless';
import { getHeaders } from './cors-headers';

const SUPABASE_BUCKET = 'tutorcat';
const AUDIO_EXTENSIONS = ['.webm', '.mp4', '.ogg', '.m4a', '.wav', '.mp3'];

let cachedAudioCount: { value: number; computedAtMs: number } | null = null;
const AUDIO_COUNT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function countAllAudioFiles(storage: any): Promise<number> {
  // Walk the bucket and count audio objects. Cached in-memory (best effort).
  const now = Date.now();
  if (cachedAudioCount && now - cachedAudioCount.computedAtMs < AUDIO_COUNT_CACHE_TTL_MS) {
    return cachedAudioCount.value;
  }

  let total = 0;
  let offset = 0;
  const pageSize = 1000;
  const maxIterations = 200; // safety cap (up to 200k objects scanned)

  for (let i = 0; i < maxIterations; i++) {
    const { data, error } = await storage.list('', {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'desc' },
    } as any);
    if (error) break;
    const objects = Array.isArray(data) ? data : [];
    if (objects.length === 0) break;

    for (const o of objects) {
      const name = typeof o?.name === 'string' ? o.name : '';
      const lower = name.toLowerCase();
      if (AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))) total += 1;
    }

    offset += objects.length;
    if (objects.length < pageSize) break;
  }

  cachedAudioCount = { value: total, computedAtMs: now };
  return total;
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

function baselineFromFeatures(featuresPayload: any): { mode: 'reading' | 'speaking'; confidence: number; spokenPct: number } | null {
  const whisper = featuresPayload?.whisper_verbose;
  const rhythm = featuresPayload?.browser_rhythm;
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

  const voicedRatio: number = typeof rhythm?.voiced_ratio === 'number' ? rhythm.voiced_ratio : NaN;
  const pauseEntropy: number = typeof rhythm?.pause_entropy === 'number' ? rhythm.pause_entropy : NaN;

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

async function downloadFeatures(storage: any, baseKey: string): Promise<any | null> {
  try {
    const path = `${baseKey}.features.JSON`;
    const { data, error } = await storage.download(path);
    if (error || !data) return null;
    const text = await (data as Blob).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toInt(value: string | null | undefined, fallback: number): number {
  const n = Number.parseInt((value || '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function baseKeyFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function isUuidLike(value: string): boolean {
  // Loose UUID v4-ish check; enough to avoid casting errors.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function shouldExcludeAttempt(job: any): boolean {
  const status = typeof job?.status === 'string' ? job.status : '';
  const result = job?.result_json;

  // Exclude min-words failures (explicitly requested).
  if (status === 'failed' && result && typeof result === 'object') {
    const minWords = (result as any).min_words;
    const wordCount = (result as any).word_count;
    if (typeof minWords === 'number' && typeof wordCount === 'number') {
      return true;
    }
  }

  // Exclude AI safety flagged attempts (explicitly requested).
  if (result && typeof result === 'object') {
    const integrity = (result as any).integrity;
    if (integrity && typeof integrity === 'object') {
      const flagged = (integrity as any).flagged;
      const riskScore = (integrity as any).risk_score;
      if (flagged === true) return true;
      if (typeof riskScore === 'number' && riskScore >= 50) return true;
    }
  }

  return false;
}

export const handler: Handler = async (event) => {
  const headers = { ...getHeaders(event, false), 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' } as any;
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) } as any;
  }

  const url = new URL(event.rawUrl || `http://localhost${event.path}`);
  const page = Math.max(1, toInt(url.searchParams.get('page'), 1));
  const limit = Math.min(100, Math.max(1, toInt(url.searchParams.get('limit'), 25)));
  const offset = (page - 1) * limit;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY)?.trim();
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Storage not configured' }) } as any;
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: 'Database configuration error' }) } as any;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const storage = supabase.storage.from(SUPABASE_BUCKET);

    // Supabase list() is not filtered by extension. If we only request limit+1 objects then
    // filter to audio, we can incorrectly think there is no next page.
    // So we paginate through storage until we collect limit+1 audio items (or exhaust), with a safety cap.
    const requested = limit + 1;
    const collected: any[] = [];
    let cursorOffset = offset;
    const maxIterations = 10;
    const pageSize = 200; // reasonable; Supabase list typically supports up to 1000

    for (let i = 0; i < maxIterations && collected.length < requested; i++) {
      const { data, error } = await storage.list('', {
        limit: pageSize,
        offset: cursorOffset,
        sortBy: { column: 'name', order: 'desc' },
      } as any);

      if (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) } as any;
      }

      const objects = Array.isArray(data) ? data : [];
      if (objects.length === 0) break;

      for (const o of objects) {
        const name = typeof o?.name === 'string' ? o.name : '';
        const lower = name.toLowerCase();
        if (AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
          collected.push(o);
          if (collected.length >= requested) break;
        }
      }

      cursorOffset += objects.length;

      // If we got fewer than pageSize, we've reached the end.
      if (objects.length < pageSize) break;
    }

    const hasMore = collected.length > limit;
    const pageItems = collected.slice(0, limit).map((o: any) => {
      const filename = o.name as string;
      return {
        filename,
        baseKey: baseKeyFromFilename(filename),
      };
    });

    // Enrich with speech_jobs metadata (prompt/user/status/created_at) and filter failed attempts.
    const baseKeys = Array.from(new Set(pageItems.map((it) => it.baseKey))).filter(isUuidLike);
    const jobById = new Map<string, any>();
    if (baseKeys.length > 0) {
      const sql = neon(databaseUrl);
      const rows = await sql`
        SELECT id::text, user_id::text as user_id, prompt_id, status, created_at, result_json
        FROM speech_jobs
        WHERE id = ANY(${baseKeys}::uuid[])
      `;
      for (const r of rows as any[]) {
        jobById.set(r.id, r);
      }
    }

    const filtered = pageItems
      .map((it) => {
        const job = jobById.get(it.baseKey);
        return {
          ...it,
          status: job?.status || null,
          promptId: job?.prompt_id || null,
          userId: job?.user_id || null,
          createdAt: job?.created_at || null,
          _job: job || null,
        };
      })
      .filter((it) => {
        // If we don't have DB info, keep it (public page may include non-job audio).
        if (!it._job) return true;
        return !shouldExcludeAttempt(it._job);
      })
      .map(({ _job, ...rest }) => rest);

    // Baseline prediction from Supabase features.JSON (same backend call as listing).
    // Keep this lightweight: only do it for UUID-like keys and with a small concurrency.
    const filteredKeys = Array.from(new Set(filtered.map((i: any) => i.baseKey))).filter(isUuidLike);
    const predictionByKey = new Map<string, any>();
    const concurrency = 6;
    for (let i = 0; i < filteredKeys.length; i += concurrency) {
      const chunk = filteredKeys.slice(i, i + concurrency);
      const results = await Promise.all(
        chunk.map(async (k) => {
          const feats = await downloadFeatures(storage, k);
          const pred = feats ? baselineFromFeatures(feats) : null;
          return { baseKey: k, pred };
        })
      );
      for (const r of results) predictionByKey.set(r.baseKey, r.pred);
    }

    const withBaseline = filtered.map((it: any) => ({
      ...it,
      baseline: predictionByKey.get(it.baseKey) ?? null,
    }));

    const totalAudio = await countAllAudioFiles(storage);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        page,
        limit,
        hasMore,
        totalAudio,
        items: withBaseline,
      }),
    } as any;
  } catch (e) {
    console.error('public-list-recordings error', e);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: (e as Error).message }) } as any;
  }
};

