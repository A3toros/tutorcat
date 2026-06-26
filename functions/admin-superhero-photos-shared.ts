import { createSignedSuperheroUrl } from './superhero-supabase-storage.js';

export const LESSON_4_SLUG = 'create-your-superhero';

export async function authenticateAdminPhotos(event: {
  headers?: { cookie?: string };
}): Promise<boolean> {
  try {
    const cookies = event.headers?.cookie || '';
    const tokenCookie = cookies.split(';').find((c: string) => c.trim().startsWith('admin_token='));
    if (!tokenCookie) return false;
    const token = tokenCookie.split('=')[1];
    const jwt = await import('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return false;
    const decoded = jwt.verify(token, jwtSecret) as { role?: string };
    return decoded.role === 'admin';
  } catch {
    return false;
  }
}

export type ResolvedSuperheroPhoto = {
  completed_at: string;
  image_url: string;
  selfie_url: string | null;
  why_chosen: string | null;
  provider: string | null;
};

export async function resolveSuperheroPhotoFromAnswers(
  answers: Record<string, unknown>,
  completedAt: string
): Promise<ResolvedSuperheroPhoto | null> {
  const portraitPath =
    typeof answers.portrait_storage_path === 'string' ? answers.portrait_storage_path : null;
  const selfiePath =
    typeof answers.selfie_storage_path === 'string' ? answers.selfie_storage_path : null;

  let imageUrl: string | null = null;
  let selfieUrl: string | null = null;

  if (portraitPath) {
    imageUrl = await createSignedSuperheroUrl(portraitPath);
  } else if (
    typeof answers.image_data_url === 'string' &&
    answers.image_data_url.startsWith('data:image/')
  ) {
    imageUrl = answers.image_data_url;
  }

  if (selfiePath) {
    selfieUrl = await createSignedSuperheroUrl(selfiePath);
  } else if (
    typeof answers.selfie_data_url === 'string' &&
    answers.selfie_data_url.startsWith('data:image/')
  ) {
    selfieUrl = answers.selfie_data_url;
  }

  if (!imageUrl) return null;

  return {
    completed_at: completedAt,
    image_url: imageUrl,
    selfie_url: selfieUrl,
    why_chosen: typeof answers.why_chosen === 'string' ? answers.why_chosen : null,
    provider: typeof answers.provider === 'string' ? answers.provider : null,
  };
}

export const CLASS_1_15 = [
  '52439', '52440', '52441', '52442', '52443', '52444', '52445', '52446', '52447', '52448',
  '52449', '52450', '52451', '52452', '52453',
];

export const CLASS_1_16 = [
  '52454', '52455', '52456', '52457', '52458', '52459', '52460', '52461', '52462', '52463',
  '52464', '52465', '52466', '52467', '52468', '52469', '52470',
];

export function classLabelForSchoolId(sid: string | null | undefined): '1/15' | '1/16' | null {
  if (!sid) return null;
  if (CLASS_1_15.includes(sid)) return '1/15';
  if (CLASS_1_16.includes(sid)) return '1/16';
  return null;
}
