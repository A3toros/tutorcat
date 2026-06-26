import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPERHERO_SUPABASE_BUCKET = 'superheros';
const SIGNED_URL_EXPIRES_SEC = 3600;

export function getSuperheroSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

export function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; ext: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL');
  }
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = contentType.includes('jpeg') || contentType.includes('jpg')
    ? '.jpg'
    : contentType.includes('webp')
      ? '.webp'
      : '.png';
  return { buffer, contentType, ext };
}

export function superheroSelfiePath(jobId: string, ext: string): string {
  return `${jobId}/selfie${ext}`;
}

export function superheroPortraitPath(jobId: string): string {
  return `${jobId}/portrait.png`;
}

export async function uploadSuperheroBuffer(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const supabase = getSuperheroSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase storage not configured');
  }
  const { error } = await supabase.storage.from(SUPERHERO_SUPABASE_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }
  return path;
}

export async function uploadSuperheroDataUrl(path: string, dataUrl: string): Promise<string> {
  const { buffer, contentType } = parseDataUrl(dataUrl);
  return uploadSuperheroBuffer(path, buffer, contentType);
}

export async function createSignedSuperheroUrl(
  path: string,
  expiresSec = SIGNED_URL_EXPIRES_SEC
): Promise<string | null> {
  const supabase = getSuperheroSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(SUPERHERO_SUPABASE_BUCKET)
    .createSignedUrl(path, expiresSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function downloadSuperheroDataUrl(path: string): Promise<string> {
  const supabase = getSuperheroSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase storage not configured');
  }
  const { data, error } = await supabase.storage.from(SUPERHERO_SUPABASE_BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Supabase download failed: ${error?.message || 'no data'}`);
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const mime = data.type || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export type StoredSuperheroResult = {
  job_id: string;
  portrait_storage_path: string;
  selfie_storage_path: string;
  model: string;
  generation_method: 'edit' | 'generate';
  prompt_used: string;
  facial_features: string;
  look_design: string;
  why_chosen: string;
};

export async function hydrateSuperheroResultForClient(
  jobId: string,
  stored: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const portraitPath =
    typeof stored.portrait_storage_path === 'string' ? stored.portrait_storage_path : null;
  const selfiePath =
    typeof stored.selfie_storage_path === 'string' ? stored.selfie_storage_path : null;

  const [imageUrl, selfieUrl] = await Promise.all([
    portraitPath ? createSignedSuperheroUrl(portraitPath) : null,
    selfiePath ? createSignedSuperheroUrl(selfiePath) : null,
  ]);

  return {
    job_id: jobId,
    portrait_storage_path: portraitPath,
    selfie_storage_path: selfiePath,
    image_url: imageUrl,
    selfie_url: selfieUrl,
    image_data_url: null,
    model: stored.model,
    generation_method: stored.generation_method,
    prompt_used: stored.prompt_used,
    facial_features: stored.facial_features,
    look_design: stored.look_design,
    why_chosen: stored.why_chosen,
  };
}
