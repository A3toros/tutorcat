/**
 * Background function: runs speech feedback analysis (up to 15 min).
 * Invoked by speech-job and retry-speech-analysis after creating a job.
 * POST body: { jobId: string }
 */
import OpenAI from 'openai';
import { neon } from '@neondatabase/serverless';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function getMinWordsForLevel(cefrLevel?: string | null, minWordsOverride?: number | null): number {
  if (typeof minWordsOverride === 'number') return Math.max(0, minWordsOverride);
  const level = (cefrLevel || '').toUpperCase().trim();
  if (level === 'A1' || level === 'A2') return 20;
  if (level === 'B1' || level === 'B2') return 40;
  if (level === 'C1' || level === 'C2') return 60;
  return 20;
}

function buildSystemPrompt(
  targetWords: number,
  minWordsForImproved: number,
  maxWordsForImproved: number,
  cefrLevel: string
): string {
  return `Analyze speech for language learning. Return concise JSON (keep response SHORT for speed):
{
  "overall_score": number (0-100),
  "is_off_topic": boolean (only if completely irrelevant),
  "feedback": "1-2 sentence summary only",
  "grammar_corrections": [{"mistake": "text", "correction": "text"}],
  "vocabulary_corrections": [{"mistake": "text", "correction": "text"}],
  "improved_transcript": "a clean, condensed, and enhanced version of the student's transcript. SELECT THE BEST AND MOST IMPORTANT PARTS of what the student said - do NOT repeat everything. Condense redundant or repetitive content. Fix all grammar and vocabulary mistakes. Enhance the language naturally while preserving the core meaning. Combine multiple sentences into one coherent, well-structured paragraph that flows naturally. Use appropriate transitions and connectors. CRITICAL: The improved_transcript must be EXACTLY between ${minWordsForImproved} and ${maxWordsForImproved} words (target: ${targetWords} words). The text must be COMPLETE and NATURAL - do NOT truncate or cut off mid-sentence. Create a full, coherent paragraph that ends naturally with proper punctuation. The text must NATURALLY fit within this exact word count range (${minWordsForImproved}-${maxWordsForImproved} words) while being a complete, finished thought. Select the best content, condense it, and enhance it - do not just copy everything. Keep it concise, polished, and appropriate for the student's level.",
  "assessed_level": "Pre-A1" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2",
  "word_count": number,
  "grammar_constructions_count": number (count of distinct grammar structures used: simple past, present perfect, conditionals, passive voice, relative clauses, etc.),
  "vocabulary_quality": number (0-100),
  "fluency_score": number (0-100),
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

CRITICAL CONTEXT: This is a 1-minute (60 second) speaking evaluation. Word count expectations:
- 50 words in 1 minute = GOOD (average student performance)
- 75 words in 1 minute = VERY GOOD (above average)
- 100 words in 1 minute = EXCELLENT (fantastic performance, most students struggle to reach this)
- 120+ words in 1 minute = OUTSTANDING (exceptional fluency)

Be FAIR and GENEROUS in your assessment. Most students can barely say 50 words in 1 minute, so 100 words is truly excellent performance.

Assess CEFR level (Pre-A1, A1, A2, B1, B2, C1, C2) from vocabulary, grammar complexity, coherence, and fluency using standard CEFR descriptors.

Grammar and vocabulary corrections: list only ACTUAL errors. LIMIT: at most 3 grammar_corrections and 3 vocabulary_corrections. Keep feedback to 1-2 sentences.
Short-answer safeguard (very important): If the response is shorter than 35 words, do NOT treat perfect grammar as an AI signal; simple sentences are normal for beginners. risk_score must stay ≤30 unless strong AI signals appear (essay structure, formal connectors, advanced vocabulary).
INTEGRITY RULE: If you have zero or only 1 real error, set integrity.risk_score to at least 65. If integrity.risk_score >= 60 set integrity.flagged=true and integrity.message to: "Your answer was flagged for using AI. Please try again using your own words."
Return assessed_level as one of: Pre-A1, A1, A2, B1, B2, C1, C2`;
}

async function runFeedbackAnalysis(
  transcription: string,
  prompt: string,
  cefrLevel: string | null
): Promise<{ success: true; feedback: Record<string, unknown> } | { success: false; error: string }> {
  if (!openai) return { success: false, error: 'OpenAI not configured' };

  const targetWords = getMinWordsForLevel(cefrLevel, null);
  const minWordsForImproved = Math.max(0, targetWords - 20);
  const maxWordsForImproved = targetWords + 20;
  const systemPrompt = buildSystemPrompt(targetWords, minWordsForImproved, maxWordsForImproved, cefrLevel || 'unknown');

  const feedbackResponse = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    max_completion_tokens: 4000,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Recording Duration: 1 minute (60 seconds)\nPrompt: "${prompt}"\n\nStudent's spoken response: "${transcription}"\n\nPlease analyze their speaking performance fairly. The improved_transcript must be EXACTLY between ${minWordsForImproved} and ${maxWordsForImproved} words (target: ${targetWords} words).`,
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
  integrity.flagged = (integrity.risk_score as number) >= 60;
  if (typeof integrity.message !== 'string' || !integrity.message) {
    integrity.message = integrity.flagged ? 'Your answer was flagged for using AI. Please try again using your own words.' : '';
  }
  if (!integrity.signals || typeof integrity.signals !== 'object') {
    integrity.signals = { level_mismatch: 0, off_syllabus_vocab: 0, robotic_cues: 0 };
  }

  const validLevels = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  if (feedback.assessed_level && !validLevels.includes(feedback.assessed_level as string)) delete feedback.assessed_level;

  if (typeof feedback.overall_score !== 'number' || typeof feedback.feedback !== 'string') {
    return { success: false, error: 'AI response missing required fields' };
  }

  return { success: true, feedback };
}

export default async (req: Request): Promise<void> => {
  if (req.method !== 'POST') return;

  let jobId: string;
  try {
    const body = await req.json();
    jobId = body?.jobId;
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      console.error('run-speech-analysis-background: missing or invalid jobId');
      return;
    }
    jobId = jobId.trim();
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
    console.error('run-speech-analysis-background: job not found', jobId);
    return;
  }

  if (job.status !== 'processing') {
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
