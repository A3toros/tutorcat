import { Handler } from '@netlify/functions';
import OpenAI from 'openai';

// Initialize OpenAI client
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Level-based minimum word count: A1/A2 = 20, B1/B2 = 40, C1/C2 = 60 (default 20)
function getMinWordsForLevel(cefrLevel?: string | null): number {
  if (!cefrLevel) return 20;
  const level = (cefrLevel || '').toUpperCase().trim();
  if (level === 'A1' || level === 'A2') return 20;
  if (level === 'B1' || level === 'B2') return 40;
  if (level === 'C1' || level === 'C2') return 60;
  return 20;
}

function shrinkCombinedInput(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';

  // Prefer only the [Answer N] lines to reduce prompt tokens.
  const answerLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('[Answer'));

  const base = answerLines.length > 0 ? answerLines.join('\n') : text;

  // Cap total characters so the model can always respond.
  const MAX_CHARS = 800;
  if (base.length <= MAX_CHARS) return base;
  return base.slice(0, MAX_CHARS);
}

interface RequestBody {
  text: string;
  prompt?: string;
  criteria?: { grammar?: boolean; vocabulary?: boolean };
  level: string;
  maxWords?: number;
  minWords?: number;
  segmentCount?: number;
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

    if (!body.text || !body.level) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'Missing text or level' })
      } as any;
    }

    // Check OpenAI API key
    if (!OPENAI_API_KEY || OPENAI_API_KEY.trim() === '') {
      console.error('❌ CRITICAL: OpenAI API key is missing or empty!');
      throw new Error('OpenAI API key is required but not configured. Please set OPENAI_API_KEY in your environment.');
    }

    console.log('✨ Improving transcription text...');

    const level = (body.level || '').trim();
    const targetWords = body.maxWords != null ? body.maxWords - 20 : getMinWordsForLevel(level);
    const maxWordsForImproved = body.maxWords ?? targetWords + 20;
    const minWordsForImproved = body.minWords ?? Math.max(0, targetWords - 20);

    const segmentCount = typeof body.segmentCount === 'number' ? body.segmentCount : null;

    console.log('📊 improve-transcription input:', {
      level,
      maxWords: maxWordsForImproved,
      minWords: minWordsForImproved,
      segmentCount: segmentCount ?? undefined,
      textLength: body.text.length
    });

    const segmentRule =
      segmentCount && segmentCount > 1
        ? `\n- The input contains exactly ${segmentCount} separate answers (from ${segmentCount} different questions). You MUST use ideas from ALL ${segmentCount} answers to build ONE merged paragraph. Do NOT output only the first answer. Do NOT list each answer; merge and shorten.`
        : '';

    console.time('✨ Text Improvement Time');

    const systemPrompt = `You are an expert English teacher. The user will paste SEVERAL separate spoken answers from a student (each was a different question). Your job is to output ONE short, improved paragraph that MERGES and CONDENSES what they said.

STRICT RULES:
- Do NOT list or concatenate each answer one after another. Do NOT write "First... Second... Then...".
- Do NOT include every detail from every answer. SELECT the best 1–2 main ideas and express them in one flowing paragraph.
- MERGE: one coherent paragraph (2–4 sentences), as if the student had said one short summary. Fix grammar and word choice; keep their meaning.${segmentRule}
- Word limit is CRITICAL: output MUST be between ${minWordsForImproved} and ${maxWordsForImproved} words (target ${targetWords}) for level ${level}. Never exceed ${maxWordsForImproved} words.
- If the input is long, you MUST condense heavily. One short paragraph only. Return only the improved text, nothing else.`

    const makeUserPrompt = (inputText: string) => `The following text is ${segmentCount && segmentCount > 1 ? `${segmentCount} separate spoken answers from a student (different questions), pasted one after another. You MUST use content from ALL ${segmentCount} answers.` : 'several separate spoken answers from a student (different questions), pasted one after another.'}
Turn this into ONE short, improved paragraph: correct grammar, fix vocabulary, merge the main ideas. Do NOT list each answer. Do NOT output only the first answer. Output one flowing paragraph of between ${minWordsForImproved} and ${maxWordsForImproved} words (level ${level}).

Input:
"${inputText}"

Output (one paragraph only, ${minWordsForImproved}-${maxWordsForImproved} words):`;

    const runOnce = async (inputText: string, attemptLabel: string) => {
      console.log('📝 improve-transcription request (preview):', {
        attempt: attemptLabel,
        model: 'gpt-4o-mini',
        inputLength: inputText.length,
        systemPreview: systemPrompt.slice(0, 300),
        userPreview: makeUserPrompt(inputText).slice(0, 300),
      });
      return await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_completion_tokens: 250,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: makeUserPrompt(inputText) },
        ],
      });
    };

    // Single attempt (stable model) with shrunk input
    const inputText = shrinkCombinedInput(body.text) || body.text;
    let improvementResponse = await runOnce(inputText, 'primary');

    console.timeEnd('✨ Text Improvement Time');

    const u = improvementResponse?.usage;
    if (u) console.log('📊 Tokens used (improve-transcription):', { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, total_tokens: u.total_tokens });

    let choice = improvementResponse?.choices?.[0];
    let content = choice?.message?.content;
    let finishReason = choice?.finish_reason;

    // If we somehow get empty content, retry once with the same stable model and the already-shrunk input.
    if ((!content || typeof content !== 'string' || !content.trim()) && finishReason === 'length') {
      console.warn('⚠️ improve-transcription: empty content at length limit; retrying once', {
        inputLength: inputText.length,
      });
      console.time('✨ Text Improvement Time (retry)');
      improvementResponse = await runOnce(inputText, 'retry');
      console.timeEnd('✨ Text Improvement Time (retry)');
      choice = improvementResponse?.choices?.[0];
      content = choice?.message?.content;
      finishReason = choice?.finish_reason;
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      const isTokenLimit = finishReason === 'length';
      console.error('Invalid response from OpenAI (improve-transcription) – full choice:', JSON.stringify(choice, null, 2));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: isTokenLimit
            ? 'Model output was too long to return a result. Please shorten the inputs and try again.'
            : 'Invalid response from OpenAI',
          error_code: isTokenLimit ? 'response_too_long_empty' : 'invalid_response',
          improved_text: null
        })
      } as any;
    }

    const improvedText = content.trim();
    if (finishReason === 'length') {
      console.warn('⚠️ improve-transcription: model output hit length limit; will trim to word band', {
        level,
        maxWords: maxWordsForImproved,
        segmentCount: segmentCount ?? undefined
      });
    }
    console.log(`✅ Text improvement completed - Input: ${body.text.length} chars, Output: ${improvedText.length} chars`);

    // Enforce word limit server-side: if model returned too much, trim to last full sentence (no mid-sentence "...")
    const words = improvedText.split(/\s+/).filter(Boolean);
    if (words.length > maxWordsForImproved) {
      const truncated = words.slice(0, maxWordsForImproved).join(' ');
      const lastDot = truncated.lastIndexOf('.');
      const lastExcl = truncated.lastIndexOf('!');
      const lastQ = truncated.lastIndexOf('?');
      const lastSentenceEnd = Math.max(lastDot, lastExcl, lastQ);
      const finalText = lastSentenceEnd >= 0 ? truncated.substring(0, lastSentenceEnd + 1).trim() : truncated;
      console.log(`⚠️ Improved text exceeded ${maxWordsForImproved} words (got ${words.length}); trimmed to last full sentence.`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          improved_text: finalText
        })
      } as any;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        improved_text: improvedText
      })
    } as any;

  } catch (error) {
    console.error('❌ Error in improve-transcription:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const statusCode = 500;
    const errorCode =
      errorMessage.toLowerCase().includes('api key') ? 'missing_api_key'
      : errorMessage.toLowerCase().includes('rate') ? 'rate_limited'
      : 'server_error';

    return {
      statusCode,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        error_code: errorCode,
        improved_text: null
      })
    } as any;
  }
};

export { handler };
