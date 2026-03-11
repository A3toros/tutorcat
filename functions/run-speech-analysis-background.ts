/**
 * Netlify Background Function: runs speech feedback analysis (up to 15 min).
 * Filename suffix -background makes Netlify return 202 immediately and run this async.
 * Invoke with POST body: { jobId: string }
 * @see https://docs.netlify.com/build/functions/background-functions/
 */
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';

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
  }
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
Keep responses brief.`;

async function runFeedbackAnalysis(
  transcription: string,
  prompt: string,
  cefrLevel: string | null
): Promise<{ success: true; feedback: Record<string, unknown> } | { success: false; error: string }> {
  if (!openai) return { success: false, error: 'OpenAI not configured' };

  const feedbackResponse = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 3000,
    messages: [
      { role: 'system', content: FEEDBACK_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Prompt: "${prompt}"

Expected CEFR level: ${cefrLevel || 'unknown'}

Student's spoken response: "${transcription}"

Please analyze their speaking performance. Focus on how well they addressed the prompt, their grammar accuracy, vocabulary usage, and fluency.`,
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

  return { success: true, feedback };
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
    SELECT id, transcript, status, prompt, cefr_level, min_words
    FROM speech_jobs
    WHERE id = ${jobId}
  `;
  const job = jobRows[0] as { id: string; transcript: string; status: string; prompt: string | null; cefr_level: string | null; min_words: number | null } | undefined;
  if (!job) {
    console.warn('run-speech-analysis-background: job not found (may be replication delay)', { jobId });
    return;
  }

  if (job.status !== 'processing') {
    console.log('run-speech-analysis-background: another worker won the race', { jobId, status: job.status });
    return;
  }

  const wordCount = job.transcript.trim().split(/\s+/).filter(Boolean).length;
  const minWords = job.min_words != null && typeof job.min_words === 'number' ? job.min_words : 0;
  if (minWords > 0 && wordCount < minWords) {
    const errorMsg = `Please speak at least ${minWords} words. You said ${wordCount} word(s).`;
    await sql`
      UPDATE speech_jobs
      SET status = 'failed', error = ${errorMsg}, result_json = ${JSON.stringify({ min_words: minWords, word_count: wordCount, error: errorMsg })}::jsonb, updated_at = NOW()
      WHERE id = ${jobId}
    `;
    return;
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

  try {
    const result = await runFeedbackAnalysis(
      job.transcript,
      job.prompt || 'Please respond to the speaking question.',
      job.cefr_level
    );
    if (result.success) {
      await sql`
        UPDATE speech_jobs
        SET status = 'completed', result_json = ${JSON.stringify(result.feedback)}::jsonb, error = NULL, updated_at = NOW()
        WHERE id = ${jobId}
      `;
    } else {
      await sql`
        UPDATE speech_jobs
        SET status = 'failed', error = ${result.error}, updated_at = NOW()
        WHERE id = ${jobId}
      `;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    console.error('run-speech-analysis-background: analysis error', err);
    await sql`
      UPDATE speech_jobs
      SET status = 'failed', error = ${message}, updated_at = NOW()
      WHERE id = ${jobId}
    `;
  }
};
