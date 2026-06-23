import { Handler } from '@netlify/functions';
import { getHeaders } from './cors-headers';
import {
  assertPromptSafe,
  assertSelfiePresent,
  buildImagePrompt,
  describeSelfieForCartoon,
  getOpenAIClient,
  resolveSuperheroAiBundle,
} from './superhero-ai-shared.js';

const IMAGE_MODEL = process.env.SUPERHERO_IMAGE_MODEL || 'dall-e-3';

async function generateImage(openai: ReturnType<typeof getOpenAIClient>, prompt: string) {
  assertPromptSafe(prompt);
  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    response_format: 'b64_json',
  });
  const item = response.data?.[0];
  if (!item?.b64_json) {
    throw new Error('Image provider returned no image data');
  }
  return {
    image_data_url: `data:image/png;base64,${item.b64_json}`,
    image_url: item.url ?? null,
    model: IMAGE_MODEL,
  };
}

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
    assertSelfiePresent(bundle);
    const openai = getOpenAIClient();

    let selfieHints: string | null = null;
    try {
      selfieHints = await describeSelfieForCartoon(openai, bundle.selfie_data_url!);
    } catch (e) {
      console.warn('Selfie vision hints failed:', e);
      throw new Error('Could not read your photo. Retake activity #14 or choose another image.');
    }

    const prompt = buildImagePrompt(bundle, selfieHints);

    let imageResult;
    try {
      imageResult = await generateImage(openai, prompt);
    } catch (firstError) {
      console.warn('Image generation retry after:', firstError);
      const stricterPrompt = `${prompt}\nExtra rule: completely original costume and face, generic superhero only.`;
      imageResult = await generateImage(openai, stricterPrompt);
    }

    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        data: {
          ...imageResult,
          prompt_used: prompt,
          selfie_hints: selfieHints,
        },
      }),
    };
  } catch (error) {
    console.error('generate-superhero-image error:', error);
    const message = error instanceof Error ? error.message : 'Image generation failed';
    const statusCode =
      message.includes('Authentication') || message.includes('Student access')
        ? 401
        : message.includes('Complete the Powers') ||
            message.includes('hero face photo') ||
            message.includes('blocked trademark')
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
