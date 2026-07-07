/**
 * Netlify Background Function: runs speech feedback analysis (up to 15 min).
 * Filename suffix -background makes Netlify return 202 immediately and run this async.
 * Invoke with POST body: { jobId: string }
 * @see https://docs.netlify.com/build/functions/background-functions/
 */
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';
import {
  CONSECUTIVE_REPETITION_ERROR_MSG,
  detectConsecutiveRepetition,
} from './speech-consecutive-repetition';
import {
  computeRoboticVoiceScore,
  roboticVoiceToDbColumns,
  type RoboticVoiceFeaturesInput,
  type RoboticVoiceResult,
} from './robotic-voice';

const SUPABASE_BUCKET = 'tutorcat';
const FEATURES_PATH_SUFFIX = '.features.JSON';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Same system prompt as ai-speech-to-text.ts (feedback analysis) + improved_transcript for UI display.
const FEEDBACK_SYSTEM_PROMPT = `Analyze a student's spoken answer. Return concise JSON only.

{
  "overall_score": number (0-100),
  "is_off_topic": boolean,
  "feedback": "1-2 sentences",
  "grammar_corrections": [{"mistake": "text", "correction": "text"}],
  "vocabulary_corrections": [{"mistake": "text", "correction": "text"}],
  "improved_transcript": "a concise, corrected and natural version of the student's transcript. Combine the BEST and MOST IMPORTANT parts of what they said into ONE coherent paragraph. Fix grammar and word choice; keep their meaning. Use level-based word ranges: A1/A2 ≈ 20 words (±20), B1/B2 ≈ 40 (±20), C1/C2 ≈ 60 (±20). Never exceed 80 words total.",
  "integrity": {
    "risk_score": number (0-100),
    "flagged": boolean,
    "message": "string",
    "signals": {
      "level_mismatch": number (0-100),
      "off_syllabus_vocab": number (0-100),
      "robotic_cues": number (0-100)
    }
  },
  "question_repetition": boolean
}

Rules:

Grammar & Vocabulary
- List ONLY real mistakes (wrong grammar or wrong word).
- Do NOT include stylistic suggestions (e.g. adding "I", "that", or rephrasing).
- If the sentence is correct, return no corrections.
- Max 3 grammar_corrections and 3 vocabulary_corrections.
- Feedback must be 1–2 sentences.

Improved transcript (very important)
- SELECT THE BEST AND MOST IMPORTANT PARTS of what the student said - do NOT repeat everything.
- Condense redundant or repetitive content naturally.
- Output exactly ONE coherent paragraph.
- Respect level-based word ranges:
  - A1/A2 → about 20 words (between 0 and 40 words).
  - B1/B2 → about 40 words (between 20 and 60 words).
  - C1/C2 → about 60 words (between 40 and 80 words).
- Under NO circumstances exceed 80 words in improved_transcript.

AI Integrity (main goal)
We detect if AI text was written first and then read aloud.

Typical human 1-minute speech contains:
- small grammar mistakes
- repetition
- uneven phrasing

AI signals:
- perfect grammar
- essay-like structure
- generic phrases ("It is important to…", "Furthermore…", "In conclusion…")
- very balanced formal wording
- no natural mistakes

Scoring rules:
- If real grammar mistakes exist, the "0 real errors" rule cannot apply.
- 0 errors AND essay structure AND formal phrases → risk_score ≥50
- only stylistic suggestions → risk_score ≥45
- very polished text → risk_score ≥50
- 2+ AI signals → risk_score ≥50
- risk_score <30 only if speech clearly sounds spontaneous and messy

Short-answer safeguard (very important and overrides other scoring rules):
If the response is shorter than 35 words:
- Do NOT treat perfect grammar as an AI signal.
- Simple sentences are normal for beginner speakers.
- If descriptive phrasing or unnaturally polished structure appears,
  risk_score may reach 40–70.

These rules override all other scoring rules.

Signals guidance:
- level_mismatch: language much stronger than expected student level
- off_syllabus_vocab: advanced or unusual vocabulary
- robotic_cues: formal structure, generic phrases, essay tone

Integrity result:
If risk_score ≥50:
flagged = true
message = "Your answer was flagged for using AI. Please try again using your own words."

Only detect AI-generated speech. Ignore plagiarism.
Only mark is_off_topic if completely unrelated.
Keep responses brief.

Question repetition:
- If the student repeats the exact question text inside their answer,  set question_repetition = true. Note thatusing some words from question is ok
- Otherwise (no clear repetition of the question text), set question_repetition = false.`;

const WHEEL_TOPIC_SYSTEM_APPEND = `

Wheel topic mode (short label, not a question to read aloud):
- The prompt is a brief topic label. Students may naturally use words from the topic — that is fine.
- Always set question_repetition = false.
- Judge only whether they spoke about the topic (is_off_topic if completely unrelated).`;

async function runFeedbackAnalysis(
  transcription: string,
  prompt: string,
  cefrLevel: string | null,
  options?: { skipQuestionRepetition?: boolean }
): Promise<{ success: true; feedback: Record<string, unknown> } | { success: false; error: string }> {
  if (!openai) return { success: false, error: 'OpenAI not configured' };

  const skipQuestionRepetition = options?.skipQuestionRepetition === true;
  const systemPrompt = skipQuestionRepetition
    ? FEEDBACK_SYSTEM_PROMPT + WHEEL_TOPIC_SYSTEM_APPEND
    : FEEDBACK_SYSTEM_PROMPT;

  const feedbackResponse = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 3000,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Topic: "${prompt}"

Expected CEFR level: ${cefrLevel || 'unknown'}

Student's spoken response: "${transcription}"

Please analyze their speaking performance. Focus on how well they spoke about the topic, their grammar accuracy, vocabulary usage, and fluency.`,
      },
    ],
  });

  const choice = feedbackResponse?.choices?.[0];
  const content = choice?.message?.content;
  if (!content || typeof content !== 'string') {
    return { success: false, error: 'Your response was too long for the analysis to complete. Try a slightly shorter answer or retry.' };
  }

  let feedback: Record<string, unknown>;
  try {
    feedback = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { success: false, error: 'AI returned invalid JSON response' };
  }

  if (Array.isArray(feedback.grammar_corrections))
    (feedback.grammar_corrections as unknown[]) = (feedback.grammar_corrections as unknown[]).slice(0, 3);
  if (Array.isArray(feedback.vocabulary_corrections))
    (feedback.vocabulary_corrections as unknown[]) = (feedback.vocabulary_corrections as unknown[]).slice(0, 3);

  if (!feedback.integrity || typeof feedback.integrity !== 'object') feedback.integrity = {};
  const integrity = feedback.integrity as Record<string, unknown>;
  if (typeof integrity.risk_score !== 'number') integrity.risk_score = 0;
  integrity.flagged = (integrity.risk_score as number) >= 50;
  if (typeof integrity.message !== 'string' || !integrity.message) {
    integrity.message = integrity.flagged ? 'Your answer was flagged for using AI. Please try again using your own words.' : '';
  }
  if (!integrity.signals || typeof integrity.signals !== 'object') {
    integrity.signals = { level_mismatch: 0, off_syllabus_vocab: 0, robotic_cues: 0 };
  }

  if (typeof feedback.overall_score !== 'number' || typeof feedback.feedback !== 'string') {
    return { success: false, error: 'AI response missing required fields' };
  }

  if (typeof (feedback as any).question_repetition !== 'boolean') {
    (feedback as any).question_repetition = false;
  }
  if (skipQuestionRepetition) {
    (feedback as any).question_repetition = false;
  }

  // Read vs speak: probability of spoken (spontaneous) vs reading in %. High = allow, low = prompt re-record. Stub: 100% until classifier is trained.
  feedback.delivery = {
    spoken_pct: 100,
    mode: 'spoken',
    confidence: 0,
    signals: {},
    _note: 'Classifier not yet trained; all responses treated as spoken.',
  };

  return { success: true, feedback };
}

function dbCols(rv: RoboticVoiceResult | null) {
  return roboticVoiceToDbColumns(rv)
}

async function downloadJobFeatures(jobId: string): Promise<RoboticVoiceFeaturesInput | null> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key);
    const path = `${jobId}${FEATURES_PATH_SUFFIX}`;
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(path);
    if (error || !data) {
      console.warn('run-speech-analysis-background: features JSON not found', { jobId, error: error?.message });
      return null;
    }
    const text = await (data as Blob).text();
    const parsed = JSON.parse(text) as RoboticVoiceFeaturesInput & {
      activity_type?: string | null
      reference_text?: string | null
      prompt_text?: string | null
    }
    return {
      whisper_verbose: parsed.whisper_verbose ?? null,
      browser_rhythm: parsed.browser_rhythm ?? null,
      activity_type: parsed.activity_type ?? null,
      reference_text: parsed.reference_text ?? null,
      prompt_text: parsed.prompt_text ?? null,
    }
  } catch (e) {
    console.warn('run-speech-analysis-background: failed to load features JSON', { jobId, e });
    return null;
  }
}

/** Upload result JSON to Supabase Storage (tutorcat bucket) as {jobId}.JSON, same base name as the audio file. */
async function uploadResultToSupabase(
  jobId: string,
  payload: { status: string; result_json?: unknown; delivery?: unknown; error?: string }
): Promise<void> {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return;
  try {
    const body = {
      jobId,
      ...payload,
      written_at: new Date().toISOString(),
    };
    const supabase = createClient(url, key);
    const path = `${jobId}.JSON`;
    const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(path, Buffer.from(JSON.stringify(body), 'utf-8'), {
      contentType: 'application/json',
      upsert: true,
    });
    if (error) console.error('run-speech-analysis-background: Supabase JSON upload failed', error);
  } catch (e) {
    console.error('run-speech-analysis-background: Supabase JSON upload error', e);
  }
}

/** Netlify background function: default export with (req, context) → client gets 202 immediately, execution runs in background. */
export default async (req: Request, _context?: unknown): Promise<void> => {
  if (req.method !== 'POST') return;

  let jobId: string;
  try {
    const body = await req.json() as { jobId?: string };
    const raw = body?.jobId;
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      console.error('run-speech-analysis-background: missing or invalid jobId');
      return;
    }
    jobId = raw.trim();
  } catch {
    console.error('run-speech-analysis-background: invalid JSON body');
    return;
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    console.error('run-speech-analysis-background: NEON_DATABASE_URL not configured');
    return;
  }

  const sql = neon(databaseUrl);

  const jobRows = await sql`
    SELECT id, transcript, status, prompt, prompt_id, cefr_level, min_words
    FROM speech_jobs
    WHERE id = ${jobId}
  `;
  const job = jobRows[0] as {
    id: string;
    transcript: string;
    status: string;
    prompt: string | null;
    prompt_id: string | null;
    cefr_level: string | null;
    min_words: number | null;
  } | undefined;
  if (!job) {
    console.warn('run-speech-analysis-background: job not found (may be replication delay)', { jobId });
    return;
  }

  // Log Whisper transcript (raw output used for analysis)
  console.log('run-speech-analysis-background: [Whisper transcript]', job.transcript);

  if (job.status !== 'processing') {
    console.log('run-speech-analysis-background: another worker won the race', { jobId, status: job.status });
    return;
  }

  const wordCount = job.transcript.trim().split(/\s+/).filter(Boolean).length;
  const minWords = job.min_words != null && typeof job.min_words === 'number' ? job.min_words : 0;
  if (minWords > 0 && wordCount < minWords) {
    const errorMsg = `Please speak at least ${minWords} words. You said ${wordCount} word(s).`;
    const resultPayload = { min_words: minWords, word_count: wordCount, error: errorMsg };
    await sql`
      UPDATE speech_jobs
      SET status = 'failed', error = ${errorMsg}, result_json = ${JSON.stringify(resultPayload)}::jsonb, updated_at = NOW()
      WHERE id = ${jobId}
    `;
    await uploadResultToSupabase(jobId, { status: 'failed', result_json: resultPayload, error: errorMsg });
    return;
  }

  const promptId = typeof job.prompt_id === 'string' ? job.prompt_id : '';
  const isWheelTopic = promptId.includes('-wheel-');
  const isImprovementRead = promptId === 'improvement';
  if (!isWheelTopic && !isImprovementRead) {
    const repetition = detectConsecutiveRepetition(job.transcript);
    if (repetition) {
      const errorMsg = CONSECUTIVE_REPETITION_ERROR_MSG;
      const resultPayload = {
        reason: 'consecutive_repetition',
        kind: repetition.kind,
        repeated: repetition.repeated,
      };
      await sql`
        UPDATE speech_jobs
        SET status = 'failed', error = ${errorMsg}, result_json = ${JSON.stringify(resultPayload)}::jsonb, updated_at = NOW()
        WHERE id = ${jobId}
      `;
      await uploadResultToSupabase(jobId, { status: 'failed', result_json: resultPayload, error: errorMsg });
      return;
    }
  }

  const updatedRows = await sql`
    UPDATE speech_jobs
    SET status = 'analyzing', updated_at = NOW()
    WHERE id = ${jobId} AND status = 'processing'
    RETURNING id
  `;
  if (updatedRows.length === 0) {
    console.log('run-speech-analysis-background: lost race, another poll already started analysis', { jobId, status: job.status, rows_updated: 0 });
    return;
  }

  const featuresInput = await downloadJobFeatures(jobId);
  let roboticVoice: RoboticVoiceResult | null = null;
  if (featuresInput) {
    roboticVoice = computeRoboticVoiceScore({
      ...featuresInput,
      prompt_id: job.prompt_id,
      prompt_text: featuresInput.prompt_text ?? job.prompt ?? null,
    });
    console.log('run-speech-analysis-background: [robotic_voice]', {
      jobId,
      score: roboticVoice.score,
      flagged: roboticVoice.flagged,
      would_flag: roboticVoice.signals.would_flag,
      mode: roboticVoice._mode,
      rules_hit: roboticVoice.signals.rules_hit,
    });
  } else {
    console.log('run-speech-analysis-background: [robotic_voice] skipped — no features JSON', { jobId });
  }

  if (roboticVoice?.flagged === true) {
    const errorMsg = roboticVoice.message;
    const resultPayload = { reason: 'robotic_voice', robotic_voice: roboticVoice };
    const rv = dbCols(roboticVoice);
    await sql`
      UPDATE speech_jobs
      SET status = 'failed',
          error = ${errorMsg},
          result_json = ${JSON.stringify(resultPayload)}::jsonb,
          robotic_voice_score = ${rv.score},
          robotic_voice_would_flag = ${rv.would_flag},
          robotic_voice_flagged = ${rv.flagged},
          robotic_voice_rules = ${rv.rules ? JSON.stringify(rv.rules) : null}::jsonb,
          updated_at = NOW()
      WHERE id = ${jobId}
    `;
    await uploadResultToSupabase(jobId, { status: 'failed', result_json: resultPayload, error: errorMsg });
    return;
  }

  try {
    const result = await runFeedbackAnalysis(
      job.transcript,
      job.prompt || 'Please respond to the speaking question.',
      job.cefr_level,
      { skipQuestionRepetition: isWheelTopic || isImprovementRead }
    );
    if (result.success) {
      const feedback = result.feedback as any;

      // v2.4 delivery gate: use robotic-voice task context + prompt overlap.
      // The frontend will block (isDeliveryReadError) when spoken_pct < 70.
      if (roboticVoice && roboticVoice.signals && typeof roboticVoice.signals === 'object') {
        const signals = roboticVoice.signals as Record<string, unknown>
        const taskExpectation = String(signals.task_expectation || '')
        const deliveryMode = String(signals.delivery_mode || '')
        const taskInappropriateReading = signals.task_inappropriate_reading === true
        const promptOverlap = typeof signals.prompt_overlap === 'number' ? signals.prompt_overlap : null

        const shouldBlockForReading =
          !isImprovementRead &&
          (taskInappropriateReading ||
            (taskExpectation === 'spontaneous' && deliveryMode === 'reading') ||
            (promptOverlap != null && promptOverlap >= 0.55))

        if (shouldBlockForReading) {
          feedback.delivery = {
            spoken_pct: 0,
            mode: 'reading',
            confidence: 0.8,
            signals: {
              taskExpectation,
              deliveryMode,
              taskInappropriateReading,
              promptOverlap,
            },
            _note: 'Derived from robotic-voice task gate (v2.4).',
          }
        } else {
          // Keep existing stub, but ensure the shape exists.
          if (!feedback.delivery || typeof feedback.delivery !== 'object') {
            feedback.delivery = {
              spoken_pct: 100,
              mode: 'spoken',
              confidence: 0,
              signals: {},
              _note: 'No delivery classifier; default spoken.',
            }
          }
        }
      }

      if (!isWheelTopic && !isImprovementRead && feedback.question_repetition === true) {
        const errorMsg =
          'It sounds like you repeated the question instead of answering it. Please re-record your answer using your own words.';
        const resultPayload = {
          reason: 'question_repetition',
          ...(roboticVoice ? { robotic_voice: roboticVoice } : {}),
        };
        const rv = dbCols(roboticVoice);
        await sql`
          UPDATE speech_jobs
          SET status = 'failed',
              error = ${errorMsg},
              result_json = ${JSON.stringify(resultPayload)}::jsonb,
              robotic_voice_score = ${rv.score},
              robotic_voice_would_flag = ${rv.would_flag},
              robotic_voice_flagged = ${rv.flagged},
              robotic_voice_rules = ${rv.rules ? JSON.stringify(rv.rules) : null}::jsonb,
              updated_at = NOW()
          WHERE id = ${jobId}
        `;
        await uploadResultToSupabase(jobId, { status: 'failed', result_json: resultPayload, error: errorMsg });
      } else {
        if (roboticVoice) {
          feedback.robotic_voice = roboticVoice;
        }
        const rv = dbCols(roboticVoice);
        await sql`
          UPDATE speech_jobs
          SET status = 'completed',
              result_json = ${JSON.stringify(feedback)}::jsonb,
              error = NULL,
              robotic_voice_score = ${rv.score},
              robotic_voice_would_flag = ${rv.would_flag},
              robotic_voice_flagged = ${rv.flagged},
              robotic_voice_rules = ${rv.rules ? JSON.stringify(rv.rules) : null}::jsonb,
              updated_at = NOW()
          WHERE id = ${jobId}
        `;
        await uploadResultToSupabase(jobId, {
          status: 'completed',
          result_json: feedback,
          delivery: feedback?.delivery,
        });
      }
    } else {
      await sql`
        UPDATE speech_jobs
        SET status = 'failed', error = ${result.error}, updated_at = NOW()
        WHERE id = ${jobId}
      `;
      await uploadResultToSupabase(jobId, { status: 'failed', error: result.error });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    console.error('run-speech-analysis-background: analysis error', err);
    await sql`
      UPDATE speech_jobs
      SET status = 'failed', error = ${message}, updated_at = NOW()
      WHERE id = ${jobId}
    `;
    await uploadResultToSupabase(jobId, { status: 'failed', error: message });
  }
};
