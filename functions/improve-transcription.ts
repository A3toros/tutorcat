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

interface RequestBody {
  text: string;              // Raw student transcription text
  prompt?: string;           // Improvement instructions
  criteria?: {               // Optional feedback criteria
    grammar?: boolean;
    vocabulary?: boolean;
  }
  level: string;             // Required student level (e.g., A1, A2, B1...)
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

    // Calculate target word count for improved transcript (level-based with ±20 tolerance)
    const targetWords = getMinWordsForLevel(body.level);
    const maxWordsForImproved = targetWords + 20; // Allow up to target + 20 words
    const minWordsForImproved = Math.max(0, targetWords - 20); // Minimum target - 20 words
    
    console.log(`📊 Word count requirements for improved transcript - Level: ${body.level}, Target: ${targetWords}, Range: ${minWordsForImproved}-${maxWordsForImproved} words`);

    // Use the same improvement logic from ai-feedback.ts, but include level guidance if provided
    const levelHint = `Target the difficulty for level ${body.level}. Keep vocabulary and structures appropriate for that level.`;
    const wordCountGuidance = `CRITICAL: The improved text MUST be between ${minWordsForImproved} and ${maxWordsForImproved} words (target: ${targetWords} words). This is essential for the student's level (${body.level}). IMPORTANT: The text must be COMPLETE and NATURAL - do NOT truncate or cut off mid-sentence. Create a full, coherent paragraph that ends naturally with proper punctuation. The text must fit within this exact word count range (${minWordsForImproved}-${maxWordsForImproved} words) while being a complete, finished thought. Prioritize clarity and correctness while staying within the word limit.`;
    const improvementPrompt = body.prompt || `Combine and improve all the student's responses into one coherent, well-structured paragraph. Use appropriate transitions and connectors to create a unified text that flows naturally. Fix all grammar and vocabulary mistakes while maintaining the student's original meaning and intent. ${levelHint} ${wordCountGuidance}`;

    console.time('✨ Text Improvement Time');

    const improvementResponse = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      max_completion_tokens: 3000,
      messages: [
        {
          role: 'system',
          content: `You are an expert English language teacher. Your task is to improve student transcriptions by correcting grammar, enhancing vocabulary, and improving overall structure while preserving the student's original meaning and intent. Adapt your output to the student's level.

Guidelines for improvement:
- SELECT THE BEST AND MOST IMPORTANT PARTS of what the student said - do NOT repeat everything
- Condense redundant or repetitive content naturally
- Fix all grammar mistakes
- Use more appropriate vocabulary where suitable
- Improve sentence structure and flow
- Combine multiple sentences into coherent paragraphs when appropriate
- Maintain the student's core meaning and intent (but condense and enhance)
- Keep the same level of formality
- Use natural, fluent English expressions
- Keep vocabulary and complexity suitable for a ${body.level} learner
- CRITICAL: The improved text must be EXACTLY between ${minWordsForImproved} and ${maxWordsForImproved} words (target: ${targetWords} words). The text must be COMPLETE and NATURAL - do NOT truncate or cut off mid-sentence. Create a full, coherent paragraph that ends naturally with proper punctuation. The text must NATURALLY fit within this exact word count range (${minWordsForImproved}-${maxWordsForImproved} words) while being a complete, finished thought. Select the best content, condense it, enhance it - create a clean, polished version that fits naturally within the limit.

Return only the improved text, nothing else.`
        },
        {
          role: 'user',
            content: `Please improve this text: "${body.text}"

Student level: ${body.level}. Match vocabulary and complexity to this level.

CRITICAL: Create a CLEAN, CONDENSED, and ENHANCED version. SELECT THE BEST AND MOST IMPORTANT PARTS - do NOT repeat everything. Condense redundant or repetitive content. Fix all grammar and vocabulary mistakes. Enhance the language naturally while preserving the core meaning. The improved text MUST be EXACTLY between ${minWordsForImproved} and ${maxWordsForImproved} words (target: ${targetWords} words). This is essential for the student's level (${body.level}). IMPORTANT: The text must be COMPLETE and NATURAL - do NOT truncate or cut off mid-sentence. Create a full, coherent paragraph that ends naturally with proper punctuation. The text must NATURALLY fit within this exact word count range (${minWordsForImproved}-${maxWordsForImproved} words) while being a complete, finished thought. Select the best content, condense it, enhance it - do not just copy everything. Prioritize clarity, correctness, and natural flow while staying within the word limit.

Improvement instructions: ${improvementPrompt}`
        }
      ],
      temperature: 0.3
    });

    console.timeEnd('✨ Text Improvement Time');

    const u = improvementResponse?.usage;
    if (u) console.log('📊 Tokens used (improve-transcription):', { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, total_tokens: u.total_tokens });

    const choice = improvementResponse?.choices?.[0];
    const content = choice?.message?.content;
    if (!content || typeof content !== 'string') {
      const isTokenLimit = choice?.finish_reason === 'length';
      console.error('Invalid response from OpenAI (improve-transcription) – full choice:', JSON.stringify(choice, null, 2));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: isTokenLimit
            ? 'Your text is too long. Try a shorter passage and try again.'
            : 'Invalid response from OpenAI',
          improved_text: null
        })
      } as any;
    }

    const improvedText = content.trim();
    console.log(`✅ Text improvement completed - Input: ${body.text.length} chars, Output: ${improvedText.length} chars`);

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
    const statusCode = errorMessage.includes('API key') ? 500 : 500;

    return {
      statusCode,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        improved_text: null
      })
    } as any;
  }
};

export { handler };
