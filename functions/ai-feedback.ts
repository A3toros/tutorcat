import { Handler } from '@netlify/functions';
import OpenAI from 'openai';

/**
 * POST: Audio or transcript → feedback in one response.
 * Used by: evaluation page, SpeakingTest, aiFeedbackHelper.
 * For lesson speaking activity the preferred flow is speech-job + analysis-result (one request, then poll).
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Level-based minimum word count: A1/A2 = 20, B1/B2 = 40, C1/C2 = 60, 0 = no minimum (e.g. warmup)
function getMinWordsForLevel(cefrLevel?: string | null, minWordsOverride?: number | null): number {
  if (typeof minWordsOverride === 'number') return Math.max(0, minWordsOverride);
  const level = (cefrLevel || '').toUpperCase().trim();
  if (level === 'A1' || level === 'A2') return 20;
  if (level === 'B1' || level === 'B2') return 40;
  if (level === 'C1' || level === 'C2') return 60;
  return 20;
}

function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

interface RequestBody {
  audio_blob?: string      // Base64 encoded audio (optional if transcription provided)
  audio_mime_type?: string
  transcription?: string  // Pre-existing transcript (e.g. from Retry Analysis - no need to send audio again)
  prompt: string
  cefr_level?: string
  min_words?: number
  criteria?: {
    grammar?: boolean
    vocabulary?: boolean
    pronunciation?: boolean
    topic_validation?: boolean
  }
}

const handler: Handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    } as any;
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    } as any;
  }

  try {
    let body: RequestBody;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid JSON payload' })
      } as any;
    }

    if (!body.prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing prompt' })
      } as any;
    }

    // Require either audio (to transcribe) or pre-existing transcription (e.g. Retry Analysis)
    const hasAudio = !!body.audio_blob;
    const hasTranscription = typeof body.transcription === 'string' && body.transcription.trim().length > 0;
    if (!hasAudio && !hasTranscription) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing audio_blob or transcription' })
      } as any;
    }

    // Check OpenAI API key
    if (!OPENAI_API_KEY || OPENAI_API_KEY.trim() === '') {
      console.error('❌ CRITICAL: OpenAI API key is missing or empty!');
      throw new Error('OpenAI API key is required but not configured. Please set OPENAI_API_KEY in your environment.');
    }

    // TRANSCRIBE AUDIO (only if no transcription provided)
    let transcription: string;
    if (hasTranscription) {
      transcription = body.transcription!.trim();
      console.log(`📝 Using provided transcription (${transcription.length} chars), skipping audio transcription`);
      // Min-words check for transcript-only (e.g. Retry Analysis)
      const minWordsOverride = typeof body.min_words === 'string' ? parseInt(body.min_words, 10) : body.min_words;
      const minWords = getMinWordsForLevel(body.cefr_level, minWordsOverride);
      const wordCount = countWords(transcription);
      if (minWords > 0 && wordCount < minWords) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            error: `Please speak at least ${minWords} words. You said ${wordCount} word(s).`,
            transcript: transcription,
            word_count: wordCount,
            min_words: minWords
          })
        } as any;
      }
    } else {
    try {
      console.log('🎤 Transcribing audio with OpenAI Whisper...');
      
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(body.audio_blob!, 'base64');
      const bufferSizeMB = (audioBuffer.length / (1024 * 1024)).toFixed(2);
      console.log(`🎤 Starting streaming transcription: ${bufferSizeMB}MB audio`);

      // Determine file extension (prioritize M4A/AAC for better performance)
      let fileExtension = 'm4a'; // Default to M4A (AAC) - better compression & speed
      if (body.audio_mime_type) {
        const normalizedMime = body.audio_mime_type.toLowerCase().split(';')[0].trim();
        if (normalizedMime === 'audio/mp4' || normalizedMime.includes('mp4') || normalizedMime.includes('m4a')) {
          fileExtension = 'm4a'; // M4A/AAC format (optimized)
        } else if (normalizedMime === 'audio/webm' || normalizedMime.includes('webm')) {
          fileExtension = 'webm'; // fallback
        } else if (normalizedMime === 'audio/wav' || normalizedMime === 'audio/wave' || normalizedMime === 'audio/x-wav') {
          fileExtension = 'wav';
        } else if (normalizedMime === 'audio/mp3' || normalizedMime === 'audio/mpeg') {
          fileExtension = 'mp3';
        }
      }

      // Create audio file for OpenAI
      const audioFile = new File([audioBuffer], `audio.${fileExtension}`, { 
        type: body.audio_mime_type || 'audio/webm' 
      });

      console.time('🎤 Transcription Time');
      console.log('🎤 Transcribing with OpenAI Whisper...');

      // Transcribe with OpenAI Whisper
      const transcriptionResult = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1', // Correct for offline uploads/batch transcription
        language: 'en',
        response_format: 'json',
        temperature: 0
      });

      transcription = transcriptionResult.text || '';
      transcription = transcription.trim();

      console.timeEnd('🎤 Transcription Time');
      console.log(`✅ Transcription completed: "${transcription.substring(0, 50)}..."`);

      if (!transcription || transcription.length === 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Your speech was not recognized, please speak louder',
            transcript: ''
          })
        } as any;
      }

      // Enforce minimum word count (level-based: A1/A2=20, B1/B2=40, C1/C2=60)
      // Skip validation if min_words is 0 (warmup - no limit)
      // Ensure min_words is a number (handle string "0" case)
      const minWordsOverride = typeof body.min_words === 'string' ? parseInt(body.min_words, 10) : body.min_words;
      const minWords = getMinWordsForLevel(body.cefr_level, minWordsOverride);
      console.log(`📊 Word count check - min_words: ${body.min_words} (type: ${typeof body.min_words}), minWordsOverride: ${minWordsOverride}, minWords: ${minWords}`);
      const wordCount = countWords(transcription);
      if (minWords > 0 && wordCount < minWords) {
        console.log(`⚡ Response too short: ${wordCount} words (minimum ${minWords})`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            error: `Please speak at least ${minWords} words. You said ${wordCount} word(s).`,
            transcript: transcription,
            word_count: wordCount,
            min_words: minWords
          })
        } as any;
      }

    } catch (transcribeError: any) {
      console.error('❌ Transcription failed:', transcribeError);

      if (transcribeError.message?.includes('invalid api key')) {
        throw new Error('OpenAI API key is invalid or expired');
      } else if (transcribeError.message?.includes('insufficient_quota')) {
        throw new Error('OpenAI API quota exceeded');
      } else if (transcribeError.message?.includes('audio too long')) {
        throw new Error('Audio file is too long for transcription');
      } else if (transcribeError.message?.includes('unsupported file format')) {
        throw new Error('Audio format not supported by OpenAI');
      }

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Transcription failed',
          message: transcribeError.message || 'Failed to transcribe audio'
        })
      } as any;
    }
    }

    // Now provide feedback on the transcription
    try {
      // Build criteria string for the prompt (if criteria provided)
      const activeCriteria = body.criteria 
        ? Object.entries(body.criteria)
            .filter(([_, enabled]) => enabled)
            .map(([criterion, _]) => criterion)
            .join(', ')
        : 'grammar, vocabulary, pronunciation, topic_validation';

      // Calculate target word count for improved transcript (level-based with ±20 tolerance)
      // Always use level-based target, ignore min_words override (override is only for student minimum, not improved transcript target)
      const targetWords = getMinWordsForLevel(body.cefr_level, null);
      const maxWordsForImproved = targetWords + 20; // Allow up to target + 20 words
      const minWordsForImproved = Math.max(0, targetWords - 20); // Minimum target - 20 words
      
      console.log(`📊 Word count requirements for improved transcript - Level: ${body.cefr_level || 'unknown'}, Target: ${targetWords}, Range: ${minWordsForImproved}-${maxWordsForImproved} words`);

      const systemPrompt = `Analyze speech for language learning. Return concise JSON (keep response SHORT for speed):
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

Assessment Guidelines:
- Focus on overall ability (vocabulary, grammar complexity, coherence, fluency). Be generous: minor errors are fine for higher levels; 100 words in 1 min deserves 80-90+ fluency. Count distinct grammar structures used. Quality over perfect grammar.

Scoring Fairness:
- For 100 words in 1 minute: fluency_score should be 80-95 (not 70)
- For varied grammar constructions: grammar_constructions_count should reflect actual structures used
- Overall score should reward effort, fluency, and communication effectiveness

Grammar and vocabulary corrections vs suggestions:
- grammar_corrections and vocabulary_corrections must list only ACTUAL errors: wrong grammar, wrong word choice, or ungrammatical phrasing. Do NOT list stylistic rephrasing or alternative phrasings as "corrections" when the student's version is already correct. Examples that are NOT errors (do not put in corrections): "confirm it is" vs "confirm that it is"; "treat it cautiously" vs "treat it with caution"; "reliable news or official websites" vs "reliable news sources or official websites"; "Also watch for signs..." vs "I also watch for signs..." (adding subject "I" for consistency is a suggestion, not an error). Only include an item when the student's version is genuinely wrong or unclear.
- LIMIT: Include at most 3 items in grammar_corrections and at most 3 in vocabulary_corrections. Pick the most important errors only. Keep feedback to 1-2 sentences. Keep improved_transcript within the word limit but concise.
- INTEGRITY RULE: If you have zero or only 1 real error (or the only "corrections" are suggestions like adding "I" or "that"), the response is effectively flawless — set integrity.risk_score to at least 65 (strong AI signal). Real spontaneous speech almost always has multiple small errors. Do not give risk_score under 40 for polished, well-structured text with no real mistakes.

Return assessed_level as one of: Pre-A1, A1, A2, B1, B2, C1, C2

AI integrity (only goal: detect AI-generated content read aloud):
- Default assumption: students speaking for 1 minute will make several small mistakes. Perfect grammar is unusual and likely AI-generated.
- We ONLY detect whether the response was written by an AI (e.g. ChatGPT) and then read aloud or spoken via TTS. We do NOT care about plagiarism or malicious content.
- CRITICAL calibration: Spontaneous human speech in 1 minute is usually messy, repetitive, uneven, or has filler. Text that is highly polished, perfectly coherent, and sounds like a written essay was read aloud is very likely AI-generated. You MUST score such text with high risk_score (50+). Do NOT be overly conservative; when the wording clearly looks like typical ChatGPT output (polished, generic, balanced, essay-like), set risk_score to at least 60 so it gets flagged.
- What counts as AI-generated: (1) Unusually polished and coherent for spontaneous speech. (2) Generic or template-like phrasing ("It is important to", "There are several factors", "plays a key role", "In order to", "Furthermore", "In conclusion"). (3) Balanced, essay-like structure (clear intro, points, conclusion). (4) Vocabulary or syntax that sounds written/formal rather than spoken. (5) No natural signs of spontaneous production (no hesitation, repetition, or uneven flow). If 2 or more of these apply, risk_score MUST be at least 60.
- If the response is too perfect with not a single real mistake (flawless grammar and vocabulary, no errors at all), treat that as a very strong AI signal: risk_score MUST be at least 70 (99% likely AI). Real spontaneous speech almost always has at least small errors or imperfect phrasing. Same if the only "corrections" are stylistic (e.g. adding subject "I"): that means no real errors — risk_score MUST be at least 65.
- Do NOT give risk_score under 40 for polished, well-structured text with no or almost no real mistakes.
- Before setting risk_score, ask: "Could this plausibly be improvised in 1 minute, or does it look like written text (e.g. from ChatGPT) read aloud?" If it looks like written/AI text, risk_score must be 60 or higher. Only give risk_score under 30 when it clearly sounds like spontaneous human speech (imperfect, personal, or messy).
- Short-answer safeguard (very important): If the response is shorter than 35 words, do NOT treat perfect grammar as an AI signal; simple sentences are normal for beginners. risk_score must stay ≤30 unless strong AI signals appear (essay structure, formal connectors, advanced vocabulary).
- integrity.risk_score (0-100) = likelihood the content was AI-generated then spoken. Use signals: level_mismatch, off_syllabus_vocab, robotic_cues (include generic AI phrasing and essay-like structure).
- If integrity.risk_score >= 60 set integrity.flagged=true and integrity.message to: "Your answer was flagged for using AI. Please try again using your own words."
- Do NOT mention plagiarism in integrity.message. Focus only on AI-generated content.`;
      const feedbackTimeLabel = 'FeedbackAnalysis_' + Date.now();
      console.time(feedbackTimeLabel);

      const feedbackResponse = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        max_completion_tokens: 3000,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Recording Duration: 1 minute (60 seconds)\nPrompt: "${body.prompt}"\n\nStudent's spoken response: "${transcription}"\n\nPlease analyze their speaking performance fairly. Remember: 100 words in 1 minute is EXCELLENT performance. Count grammar constructions (simple past, present perfect, conditionals, passive voice, relative clauses, etc.) and be generous with fluency and vocabulary scores.\n\nCRITICAL: For the improved_transcript, you MUST create a CLEAN, CONDENSED, and ENHANCED version. SELECT THE BEST AND MOST IMPORTANT PARTS - do NOT repeat everything the student said. Condense redundant or repetitive content. Fix all grammar and vocabulary mistakes. Enhance the language naturally while preserving the core meaning. The improved_transcript must be EXACTLY between ${minWordsForImproved} and ${maxWordsForImproved} words (target: ${targetWords} words). This is essential for the student's level (${body.cefr_level || 'unknown'}). IMPORTANT: The text must be COMPLETE and NATURAL - do NOT truncate or cut off mid-sentence. Create a full, coherent paragraph that ends naturally with proper punctuation. The text must NATURALLY fit within this exact word count range (${minWordsForImproved}-${maxWordsForImproved} words) while being a complete, finished thought. Select the best content, condense it, enhance it - do not just copy everything. Prioritize clarity, correctness, and natural flow while staying within the word limit.`
          }
        ]
      });

      const u = feedbackResponse?.usage;
      if (u) console.log('📊 Tokens used:', { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, total_tokens: u.total_tokens });

      const choice = feedbackResponse?.choices?.[0];
      const content = choice?.message?.content;
      if (!content || typeof content !== 'string') {
        console.timeEnd(feedbackTimeLabel);
        console.error('Invalid response from OpenAI – full choice:', JSON.stringify(choice, null, 2));
        console.error('Invalid response from OpenAI – full response (choices only):', JSON.stringify(feedbackResponse?.choices, null, 2));
        const isTokenLimit = choice?.finish_reason === 'length';
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            error: isTokenLimit
              ? 'Your speech is too long. Try to speak less than 100 words.'
              : 'Something went wrong. Please try again.',
            error_code: isTokenLimit ? 'speech_too_long' : undefined,
            transcript: transcription
          })
        } as any;
      }

      const aiResponse = content;
      console.timeEnd(feedbackTimeLabel);
      console.log('🤖 Raw feedback response:', aiResponse?.substring(0, 100) + '...');

      // Parse the JSON response
      let feedback;
      try {
        feedback = JSON.parse(aiResponse);
        console.log(`✅ Feedback analysis completed - Score: ${feedback.overall_score}/100`);
      } catch (parseError) {
        console.error('❌ Failed to parse feedback JSON:', aiResponse);
        throw new Error('AI returned invalid JSON response');
      }

      // Enforce max 3 corrections per type (keep response small and fast)
      if (Array.isArray(feedback.grammar_corrections)) feedback.grammar_corrections = feedback.grammar_corrections.slice(0, 3);
      if (Array.isArray(feedback.vocabulary_corrections)) feedback.vocabulary_corrections = feedback.vocabulary_corrections.slice(0, 3);

      // Harden integrity output:
      if (!feedback.integrity || typeof feedback.integrity !== 'object') {
        feedback.integrity = {};
      }
      if (typeof feedback.integrity.risk_score !== 'number') {
        feedback.integrity.risk_score = 0;
      }
      feedback.integrity.flagged = feedback.integrity.risk_score >= 60;
      if (typeof feedback.integrity.message !== 'string' || !feedback.integrity.message) {
        feedback.integrity.message = feedback.integrity.flagged
          ? 'Your answer was flagged for using AI. Please try again using your own words.'
          : '';
      }
      if (!feedback.integrity.signals || typeof feedback.integrity.signals !== 'object') {
        feedback.integrity.signals = {
          level_mismatch: 0,
          off_syllabus_vocab: 0,
          robotic_cues: 0
        };
      }

      console.log('🛡️ AI integrity:', {
        risk_score: feedback.integrity.risk_score,
        flagged: feedback.integrity.flagged,
        message: feedback.integrity.message || '(none)'
      });

      // Validate the response structure (simplified)
      if (typeof feedback.overall_score !== 'number' || typeof feedback.feedback !== 'string') {
        console.error('AI response validation failed. Missing required fields:', {
          hasOverallScore: typeof feedback.overall_score === 'number',
          feedbackType: typeof feedback.feedback,
          actualResponse: feedback
        });
        throw new Error('AI response missing required fields');
      }

      // Validate correction arrays (optional but should be arrays if present)
      const correctionFields = ['grammar_corrections', 'vocabulary_corrections'];
      for (const field of correctionFields) {
        if (feedback[field] && !Array.isArray(feedback[field])) {
          console.warn(`AI response: ${field} should be an array but got ${typeof feedback[field]}`);
        }
      }

      // Validate assessed_level if present
      const validLevels = ['Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      if (feedback.assessed_level && !validLevels.includes(feedback.assessed_level)) {
        console.warn('Invalid assessed_level from AI:', feedback.assessed_level);
        // Don't fail, just remove invalid level
        delete feedback.assessed_level;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          transcript: transcription, // Include transcript in response (like ai-speech-to-text.ts)
          ...feedback
        })
      } as any;

    } catch (error) {
      console.error('❌ OpenAI API call failed:', error);

      // Return error instead of mock fallback
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'AI feedback service unavailable',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          api_status: 'error'
        })
      } as any;
    }

  } catch (error) {
    console.error('AI feedback handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error' })
    } as any;
  }
};

export { handler };
