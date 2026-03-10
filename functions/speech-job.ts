import { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';

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
  try {
    const result = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
      response_format: 'json',
      temperature: 0,
    });
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
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';
  const backgroundUrl = `${baseUrl.replace(/\/$/, '')}/.netlify/functions/run-speech-analysis-background`;

  // Trigger background analysis. Use long timeout (25s) so cold start on mobile/server can respond.
  // If this fails, we still return 200 with status 'processing' – the client will poll
  // analysis-result, which re-triggers the background when it sees processing (so no user-facing error).
  const triggerTimeoutMs = 25000;
  try {
    const res = await Promise.race([
      fetch(backgroundUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Background trigger timeout')), triggerTimeoutMs)
      ),
    ]);
    if (!res.ok) console.error('Background trigger returned', res.status);
  } catch (err) {
    console.error('Failed to trigger background analysis:', err);
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      jobId,
      status: 'processing',
    }),
  };
};
