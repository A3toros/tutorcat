import { Handler } from '@netlify/functions';
import { getHeaders } from './cors-headers';
import {
  buildAlignmentPrompt,
  getOpenAIClient,
  parseAlignmentJson,
  resolveSuperheroAiBundle,
} from './superhero-ai-shared.js';

const handler: Handler = async (event) => {
  const headers = getHeaders(event, true);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  try {
    let body: { studentLessonId?: string; bundle?: unknown };
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Invalid JSON payload' }),
      };
    }

    const { bundle } = await resolveSuperheroAiBundle(event, body);
    const prompt = buildAlignmentPrompt(bundle);
    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You classify original student superhero characters. Reply with valid JSON only, no markdown.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '';
    const parsed = parseAlignmentJson(content);

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: {
          ...parsed,
          prompt_used: prompt,
        },
      }),
    };
  } catch (error) {
    console.error('classify-hero-alignment error:', error);
    const message = error instanceof Error ? error.message : 'Classification failed';
    const statusCode =
      message.includes('Authentication') || message.includes('Student access')
        ? 401
        : message.includes('Complete the Powers')
          ? 400
          : 500;
    return {
      statusCode,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};

export { handler };
