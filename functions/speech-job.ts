import { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_BUCKET = 'tutorcat';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_DURATION_SECONDS = 120; // 2 min

interface SpeechJobBody {
  audio_blob: string;
  audio_mime_type?: string;
  prompt: string;
  prompt_id?: string;
  cefr_level?: string;
  min_words?: number;
  user_id?: string;
  duration_seconds?: number;
  lesson_id?: string;
  browser_rhythm?: {
    speech_rate?: number;
    pause_variance?: number;
    pause_entropy?: number;
    pitch_variance?: number;
    energy_variance?: number;
    voiced_ratio?: number;
    [key: string]: unknown;
  };
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body: SpeechJobBody;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON payload' }),
    };
  }

  if (!body.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing prompt' }),
    };
  }

  if (!body.audio_blob || typeof body.audio_blob !== 'string') {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing audio_blob' }),
    };
  }

  console.log('speech-job: received audio, calling Whisper... (raw output will follow)');

  // Enforce duration if client sends it (e.g. from MediaRecorder)
  if (typeof body.duration_seconds === 'number' && body.duration_seconds > MAX_DURATION_SECONDS) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Please speak for less than 2 minutes.',
        code: 'duration_too_long',
        max_duration_seconds: MAX_DURATION_SECONDS,
      }),
    };
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(body.audio_blob, 'base64');
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid base64 audio_blob' }),
    };
  }

  if (audioBuffer.length > MAX_AUDIO_SIZE_BYTES) {
    const sizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(1);
    return {
      statusCode: 413,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Please speak for less than 2 minutes. Max 20 MB.',
        code: 'audio_too_large',
        size_mb: parseFloat(sizeMB),
        max_size_mb: 10,
      }),
    };
  }

  if (!OPENAI_API_KEY?.trim()) {
    console.error('OPENAI_API_KEY missing');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  const mimeType = body.audio_mime_type || 'audio/webm';
  let fileExtension = 'webm';
  const normalizedMime = mimeType.toLowerCase().split(';')[0].trim();
  if (normalizedMime.includes('mp4') || normalizedMime.includes('m4a')) fileExtension = 'm4a';
  else if (normalizedMime.includes('wav')) fileExtension = 'wav';
  else if (normalizedMime.includes('mp3') || normalizedMime.includes('mpeg')) fileExtension = 'mp3';

  const audioFile = new File([new Uint8Array(audioBuffer)], `audio.${fileExtension}`, { type: mimeType });

  let transcript: string;
  let whisperVerboseRaw: any | null = null;
  try {
    const result = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
      // Use verbose_json so we can later use segments, timing, and confidence signals
      // for read-vs-speak and delivery analysis.
      response_format: 'verbose_json',
      temperature: 0,
    });
    // Log raw Whisper API response (terminal/console)
    console.log('speech-job: [Whisper raw output]', JSON.stringify(result, null, 2));
    whisperVerboseRaw = result;
    transcript = (result as { text?: string }).text?.trim() || '';
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    console.error('Whisper error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: message.includes('too long') ? 'Please speak for less than 2 minutes.' : 'Transcription failed.',
        code: 'transcription_failed',
      }),
    };
  }

  if (!transcript) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Your speech was not recognized. Please speak louder.',
        code: 'no_speech',
      }),
    };
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    console.error('NEON_DATABASE_URL not configured');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Database configuration error' }),
    };
  }

  const sql = neon(databaseUrl);
  const minWords = typeof body.min_words === 'number' ? body.min_words : null;
  const lessonId = typeof body.lesson_id === 'string' && body.lesson_id.trim() ? body.lesson_id.trim() : null;

  const rows = await sql`
    INSERT INTO speech_jobs (user_id, lesson_id, transcript, status, prompt, prompt_id, cefr_level, min_words, updated_at)
    VALUES (${body.user_id || null}, ${lessonId}, ${transcript}, 'processing', ${body.prompt.trim()}, ${body.prompt_id || null}, ${body.cefr_level || null}, ${minWords}, NOW())
    RETURNING id
  `;

  const row = rows[0];
  if (!row) {
    console.error('speech_jobs insert returned no row');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to create job' }),
    };
  }

  const jobId = row.id;

  // Helper: trim Whisper verbose_json to minimal structure for read-vs-speak and analysis.
  const buildMinimalWhisperVerbose = (raw: any) => {
    if (!raw || typeof raw !== 'object') return null;
    const segments = Array.isArray(raw.segments)
      ? raw.segments.map((s: any) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          avg_logprob: s.avg_logprob,
          no_speech_prob: s.no_speech_prob,
          compression_ratio: s.compression_ratio,
        }))
      : undefined;
    return {
      text: (raw as any).text,
      duration: (raw as any).duration,
      language: (raw as any).language,
      segments,
    };
  };

  // Upload audio (and sidecar JSON with Whisper + browser rhythm features) to Supabase Storage.
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (supabaseUrl && supabaseSecret) {
    try {
      const supabase = createClient(supabaseUrl, supabaseSecret);
      const audioPath = `${jobId}.${fileExtension}`;
      const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(audioPath, audioBuffer, {
        contentType: mimeType,
        upsert: true,
      });
      if (error) console.error('speech-job: Supabase audio upload failed', error);

       // Sidecar JSON with Whisper minimal verbose output + browser rhythm features for this job.
       const minimalWhisper = buildMinimalWhisperVerbose(whisperVerboseRaw);
       const featuresPayload = {
         jobId,
         whisper_verbose: minimalWhisper,
         browser_rhythm: body.browser_rhythm || null,
         created_at: new Date().toISOString(),
       };
       const featuresPath = `${jobId}.features.JSON`;
       const { error: featuresError } = await supabase.storage
         .from(SUPABASE_BUCKET)
         .upload(featuresPath, Buffer.from(JSON.stringify(featuresPayload), 'utf-8'), {
           contentType: 'application/json',
           upsert: true,
         });
       if (featuresError) console.error('speech-job: Supabase features JSON upload failed', featuresError);
    } catch (e) {
      console.error('speech-job: Supabase audio upload error', e);
    }
  }

  // Do NOT trigger background here. Client triggers it after getting jobId so it works
  // on all devices (server-to-server fetch can fail when request comes from mobile).

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      jobId,
      status: 'processing',
    }),
  };
};
