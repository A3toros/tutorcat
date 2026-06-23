import {
  assertPromptSafe,
  assertSelfiePresent,
  buildImageEditPrompt,
  buildImagePrompt,
  buildSuperheroLookRationale,
  dataUrlToImageFile,
  describeSelfieFacialFeatures,
  getOpenAIClient,
  resolveSelfieEditModel,
  supportsSelfieEditHighFidelity,
  type SuperheroAiBundle,
} from './superhero-ai-shared.js';

const IMAGE_MODEL = process.env.SUPERHERO_IMAGE_MODEL || 'gpt-image-1';

export interface SuperheroImagePipelineResult {
  image_data_url: string;
  image_url: string | null;
  model: string;
  generation_method: 'edit' | 'generate';
  prompt_used: string;
  facial_features: string;
  look_design: string;
  why_chosen: string;
}

function isGptImageModel(model: string): boolean {
  return /^gpt-image/i.test(model) || model === 'chatgpt-image-latest';
}

async function imageItemToDataUrl(item: {
  b64_json?: string | null;
  url?: string | null;
}): Promise<{ image_data_url: string; image_url: string | null }> {
  if (item?.b64_json) {
    return {
      image_data_url: `data:image/png;base64,${item.b64_json}`,
      image_url: item.url ?? null,
    };
  }
  if (item?.url) {
    const res = await fetch(item.url);
    if (!res.ok) {
      throw new Error('Image provider returned a URL but download failed');
    }
    const mime = res.headers.get('content-type') || 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      image_data_url: `data:${mime};base64,${buf.toString('base64')}`,
      image_url: item.url,
    };
  }
  throw new Error('Image provider returned no image data');
}

async function generateImageFromPrompt(openai: ReturnType<typeof getOpenAIClient>, prompt: string) {
  assertPromptSafe(prompt);

  const gpt = isGptImageModel(IMAGE_MODEL);
  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: gpt ? '1024x1536' : '1024x1024',
    quality: gpt ? 'high' : 'standard',
  });

  const item = response.data?.[0];
  if (!item) {
    throw new Error('Image provider returned no image data');
  }

  const image = await imageItemToDataUrl(item);
  return {
    ...image,
    model: IMAGE_MODEL,
    method: 'generate' as const,
  };
}

async function editPortraitFromSelfie(
  openai: ReturnType<typeof getOpenAIClient>,
  selfieDataUrl: string,
  prompt: string
) {
  assertPromptSafe(prompt);

  const editModel = resolveSelfieEditModel(IMAGE_MODEL);
  const response = await openai.images.edit({
    model: editModel,
    image: dataUrlToImageFile(selfieDataUrl),
    prompt,
    input_fidelity: 'high',
    quality: 'high',
    size: '1024x1536',
    n: 1,
  });

  const item = response.data?.[0];
  if (!item) {
    throw new Error('Image provider returned no image data');
  }

  const image = await imageItemToDataUrl(item);
  return {
    ...image,
    model: editModel,
    method: 'edit' as const,
  };
}

export async function runSuperheroImagePipeline(
  bundle: SuperheroAiBundle
): Promise<SuperheroImagePipelineResult> {
  assertSelfiePresent(bundle);
  const openai = getOpenAIClient();
  const selfieDataUrl = bundle.selfie_data_url!;

  const [lookRationale, facialFeatures] = await Promise.all([
    buildSuperheroLookRationale(openai, bundle),
    describeSelfieFacialFeatures(openai, selfieDataUrl).catch((e) => {
      console.warn('Selfie facial feature read failed:', e);
      return 'Match the student photo identity exactly.';
    }),
  ]);

  const editPrompt = buildImageEditPrompt(lookRationale.look_design);
  const textPrompt = buildImagePrompt(bundle, facialFeatures, lookRationale.look_design);
  console.log('superhero-image-worker model:', IMAGE_MODEL);

  let imageResult;
  let promptUsed = editPrompt;

  if (supportsSelfieEditHighFidelity(IMAGE_MODEL)) {
    try {
      console.log('superhero-image-worker: starting image edit');
      imageResult = await editPortraitFromSelfie(openai, selfieDataUrl, editPrompt);
      promptUsed = editPrompt;
      console.log('superhero-image-worker: image edit finished');
    } catch (editError) {
      console.warn('Selfie edit failed, falling back to text generate:', editError);
      imageResult = await generateImageFromPrompt(openai, textPrompt);
      promptUsed = textPrompt;
    }
  } else {
    imageResult = await generateImageFromPrompt(openai, textPrompt);
    promptUsed = textPrompt;
  }

  return {
    image_data_url: imageResult.image_data_url,
    image_url: imageResult.image_url,
    model: imageResult.model,
    generation_method: imageResult.method,
    prompt_used: promptUsed,
    facial_features: facialFeatures,
    look_design: lookRationale.look_design,
    why_chosen: lookRationale.why_chosen,
  };
}
