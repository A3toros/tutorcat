import * as jwt from 'jsonwebtoken';
import OpenAI from 'openai';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { requireStudentAuth } from './student-auth.js';

export const LESSON_4_SLUG = 'create-your-superhero';

export type HeroAlignment = 'hero' | 'villain' | 'anti-hero';

export interface SuperheroProfileSlot {
  template?: string;
  word: string;
  sentence: string;
}

export interface SuperheroAiBundle {
  quiz_matched_hero_id?: string;
  quiz_match_why?: string;
  profile_sentences: string[];
  profile_slots: SuperheroProfileSlot[];
  character_description: string;
  moral_summary: string[];
  alignment?: HeroAlignment;
  alignment_reasons?: string[];
  alignment_traits?: string[];
  selfie_data_url?: string | null;
}

const TRADEMARK_BLOCK =
  /\b(spider-?man|batman|superman|wonder woman|supergirl|aquaman|joker|harley quinn|marvel|dc comics|iron man|captain america|avengers|catwoman|batgirl|peacemaker)\b/i;

export async function requireAdminAuth(event: {
  headers?: { cookie?: string };
}): Promise<{ ok: true; adminUserId?: string } | { ok: false }> {
  try {
    const cookies = event.headers?.cookie || '';
    const tokenCookie = cookies.split(';').find((c: string) => c.trim().startsWith('admin_token='));
    if (!tokenCookie) return { ok: false };
    const token = tokenCookie.split('=')[1];
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return { ok: false };
    const decoded = jwt.verify(token, jwtSecret) as { role?: string; userId?: string; id?: string };
    if (decoded.role !== 'admin') return { ok: false };
    return { ok: true, adminUserId: decoded.userId || decoded.id };
  } catch {
    return { ok: false };
  }
}

export function parseBundleInput(raw: unknown): SuperheroAiBundle | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const profileSentences = Array.isArray(b.profile_sentences)
    ? b.profile_sentences.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];
  const characterDescription =
    typeof b.character_description === 'string' && b.character_description.trim()
      ? b.character_description.trim()
      : profileSentences.join('\n');
  if (!characterDescription.trim()) return null;

  const profileSlots: SuperheroProfileSlot[] = [];
  if (Array.isArray(b.profile_slots)) {
    for (const row of b.profile_slots) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const sentence = typeof r.sentence === 'string' ? r.sentence : '';
      const word = typeof r.word === 'string' ? r.word : '';
      if (!sentence) continue;
      profileSlots.push({
        template: typeof r.template === 'string' ? r.template : undefined,
        word,
        sentence,
      });
    }
  }

  const moralSummary = Array.isArray(b.moral_summary)
    ? b.moral_summary.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];

  return {
    quiz_matched_hero_id:
      typeof b.quiz_matched_hero_id === 'string' ? b.quiz_matched_hero_id : undefined,
    quiz_match_why: typeof b.quiz_match_why === 'string' ? b.quiz_match_why : undefined,
    profile_sentences: profileSentences.length ? profileSentences : characterDescription.split('\n'),
    profile_slots: profileSlots,
    character_description: characterDescription,
    moral_summary: moralSummary,
    selfie_data_url:
      typeof b.selfie_data_url === 'string' && b.selfie_data_url.startsWith('data:image/')
        ? b.selfie_data_url
        : b.selfie_data_url === null
          ? null
          : undefined,
  };
}

function answersFromRow(answers: unknown): Record<string, unknown> | undefined {
  if (!answers || typeof answers !== 'object') return undefined;
  return answers as Record<string, unknown>;
}

export function buildBundleFromActivityAnswers(
  rows: Array<{ activity_order: number; answers: unknown }>
): SuperheroAiBundle {
  const byOrder = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    const parsed = answersFromRow(row.answers);
    if (parsed) byOrder.set(Number(row.activity_order), parsed);
  }

  const quiz = byOrder.get(7);
  const profile = byOrder.get(11);
  const moral = byOrder.get(12);
  const alignmentRow = byOrder.get(14);

  const profileSlots: SuperheroProfileSlot[] = [];
  const rawSentences = profile?.sentences;
  if (Array.isArray(rawSentences)) {
    for (const row of rawSentences) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const sentence = typeof r.sentence === 'string' ? r.sentence : '';
      const word = typeof r.word === 'string' ? r.word : '';
      if (!sentence) continue;
      profileSlots.push({
        template: typeof r.template === 'string' ? r.template : undefined,
        word,
        sentence,
      });
    }
  }

  const profileSentences = profileSlots.map((s) => s.sentence);
  const moralSummary: string[] = [];
  const moralPrompts = moral?.prompts;
  if (Array.isArray(moralPrompts)) {
    for (const row of moralPrompts) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const prompt = typeof r.prompt === 'string' ? r.prompt : '';
      const transcript = typeof r.transcript === 'string' ? r.transcript.trim() : '';
      if (prompt && transcript) moralSummary.push(`${prompt} → ${transcript}`);
      else if (prompt) moralSummary.push(prompt);
    }
  }

  const alignmentRaw =
    typeof alignmentRow?.alignment_ai === 'string'
      ? alignmentRow.alignment_ai.toLowerCase()
      : '';
  const alignment: HeroAlignment | undefined =
    alignmentRaw === 'villain' || alignmentRaw === 'anti-hero' || alignmentRaw === 'hero'
      ? alignmentRaw
      : undefined;
  const alignmentReason =
    typeof alignmentRow?.alignment_ai_reason === 'string'
      ? alignmentRow.alignment_ai_reason.trim()
      : '';
  const alignmentTraits = Array.isArray(alignmentRow?.alignment_ai_traits)
    ? alignmentRow.alignment_ai_traits.filter((t): t is string => typeof t === 'string')
    : [];

  return {
    quiz_matched_hero_id:
      typeof quiz?.matched_hero_id === 'string' ? quiz.matched_hero_id : undefined,
    quiz_match_why: typeof quiz?.match_why === 'string' ? quiz.match_why : undefined,
    profile_sentences: profileSentences,
    profile_slots: profileSlots,
    character_description: profileSentences.join('\n'),
    moral_summary: moralSummary,
    alignment,
    alignment_reasons: alignmentReason ? [alignmentReason] : [],
    alignment_traits: alignmentTraits,
    selfie_data_url: null,
  };
}

export async function loadBundleForStudentLesson(
  sql: NeonQueryFunction<false, false>,
  userId: string,
  studentLessonId: string
): Promise<SuperheroAiBundle> {
  const lessonRows = await sql`
    SELECT slug FROM student_lessons WHERE id = ${studentLessonId} LIMIT 1
  `;
  if (!lessonRows.length || (lessonRows[0] as { slug: string }).slug !== LESSON_4_SLUG) {
    throw new Error('Lesson not found or not supported for superhero AI');
  }

  const rows = await sql`
    SELECT activity_order, answers
    FROM student_lesson_activity_results
    WHERE user_id = ${userId}
      AND student_lesson_id = ${studentLessonId}
      AND activity_order IN (7, 11, 12, 14)
    ORDER BY activity_order ASC
  `;

  const bundle = buildBundleFromActivityAnswers(
    rows as Array<{ activity_order: number; answers: unknown }>
  );
  if (!bundle.character_description.trim()) {
    throw new Error('Complete the Powers & weakness sentences activity first.');
  }
  return bundle;
}

export function classifierInputJson(bundle: SuperheroAiBundle): Record<string, unknown> {
  return {
    profile_sentences: bundle.profile_sentences,
    character_description: bundle.character_description,
    moral_summary: bundle.moral_summary,
  };
}

export function buildAlignmentPrompt(bundle: SuperheroAiBundle): string {
  const payload = classifierInputJson(bundle);
  return `You are helping an English class for children. Classify the student's ORIGINAL superhero character (not a famous comic hero).

Given the student choices below, respond with JSON only:
{
  "alignment": "hero" | "villain" | "anti-hero",
  "confidence": 0.0 to 1.0,
  "reasons": ["one simple English sentence", "second simple English sentence"],
  "traits": ["trait1", "trait2"]
}

Use simple English (CEFR A2). Do not mention trademark superhero names.

Student data:
${JSON.stringify(payload, null, 2)}`;
}

export function buildImagePrompt(
  bundle: SuperheroAiBundle,
  facialFeatures: string,
  lookDesign: string
): string {
  const lines = [
    'Photorealistic portrait photo of an original superhero for an English class project.',
    'CRITICAL — must be the SAME person with nearly identical face: same face shape, eyes, nose, mouth, hairline, and skin tone as described below.',
    facialFeatures,
    'Subtle flattering enhancements only: soft cinematic lighting, clear skin, confident heroic expression — slightly more handsome/beautiful but unmistakably the same person.',
    'Student powers and personality (from their own answers):',
    bundle.character_description,
    'Original superhero look to generate (not any famous comic character):',
    lookDesign,
    'Style: photorealistic photography, natural skin texture, cinematic lighting, sharp focus on the face, three-quarter portrait, subtle original heroic costume.',
    'Do NOT depict any existing copyrighted character, trademarked hero, or a different person.',
    'Do NOT include text, logos, or watermarks.',
  ];
  return lines.join('\n');
}

export function buildImageEditPrompt(lookDesign: string): string {
  return [
    'Transform this photo into a photorealistic original superhero portrait.',
    'CRITICAL: Keep the EXACT same person — same face shape, eyes, nose, mouth, jaw, hair, and skin tone. The result must look like almost the same face from the input photo.',
    'Apply only subtle flattering enhancements: soft cinematic lighting, clear healthy skin, confident heroic expression — slightly more handsome or beautiful, but still unmistakably the same individual.',
    `Add this original superhero costume and mood (not any famous hero): ${lookDesign}`,
    'Photorealistic portrait photography, three-quarter view, sharp focus on the face, plain cinematic background.',
    'Do NOT change identity to a different person. Do NOT depict copyrighted characters. No text or logos.',
  ].join('\n');
}

export function dataUrlToImageFile(dataUrl: string): File {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data');
  }
  const mime = match[1];
  const buf = Buffer.from(match[2], 'base64');
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return new File([buf], `selfie.${ext}`, { type: mime });
}

/** gpt-image-1 supports input_fidelity; mini does not. */
export function resolveSelfieEditModel(model: string): string {
  if (/^gpt-image-1$/i.test(model) || /^gpt-image-1\./i.test(model)) {
    return model;
  }
  if (/^gpt-image/i.test(model) || model === 'chatgpt-image-latest') {
    return 'gpt-image-1';
  }
  return model;
}

export function supportsSelfieEditHighFidelity(model: string): boolean {
  return /^gpt-image/i.test(model) || model === 'chatgpt-image-latest';
}

export interface SuperheroLookRationale {
  look_design: string;
  why_chosen: string;
}

export async function buildSuperheroLookRationale(
  openai: OpenAI,
  bundle: SuperheroAiBundle
): Promise<SuperheroLookRationale> {
  const payload = {
    profile_sentences: bundle.profile_sentences,
    moral_choices: bundle.moral_summary,
    magic_hat_alignment: bundle.alignment ?? null,
    magic_hat_traits: bundle.alignment_traits ?? [],
    magic_hat_reason: bundle.alignment_reasons?.join(' ') ?? null,
  };

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: `You help a children's English class design an ORIGINAL superhero portrait (never Batman, Spider-Man, etc.).

From the student's answers, respond with JSON only:
{
  "look_design": "One short paragraph for an image generator: original costume colors, power visuals, mood. No trademark names.",
  "why_chosen": "2-3 short simple English sentences (CEFR A2) telling the student WHY this superhero look fits their personality and choices. Use 'you'."
}

Student data:
${JSON.stringify(payload, null, 2)}`,
      },
    ],
    max_tokens: 320,
  });

  const raw = response.choices[0]?.message?.content?.trim() || '{}';
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const lookDesign =
    typeof parsed.look_design === 'string' && parsed.look_design.trim()
      ? parsed.look_design.trim()
      : 'Original heroic costume with colors that match their powers and loyal personality.';
  const whyChosen =
    typeof parsed.why_chosen === 'string' && parsed.why_chosen.trim()
      ? parsed.why_chosen.trim()
      : 'Your answers show a brave, original hero — so we gave you a look that matches your powers and kind choices.';

  return { look_design: lookDesign, why_chosen: whyChosen };
}

export function assertSelfiePresent(bundle: SuperheroAiBundle): void {
  if (!bundle.selfie_data_url?.startsWith('data:image/')) {
    throw new Error('Add your photo before generating your superhero portrait.');
  }
}

export function assertPromptSafe(prompt: string): void {
  if (TRADEMARK_BLOCK.test(prompt)) {
    throw new Error('Prompt contains blocked trademark terms. Use only original character details.');
  }
}

export function parseAlignmentJson(text: string): {
  alignment: HeroAlignment;
  confidence: number;
  reasons: string[];
  traits: string[];
} {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const raw = jsonMatch ? jsonMatch[0] : trimmed;
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const alignment = String(parsed.alignment || 'hero').toLowerCase();
  const normalized: HeroAlignment =
    alignment === 'villain' || alignment === 'anti-hero' ? alignment : 'hero';
  const confidence =
    typeof parsed.confidence === 'number'
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.7;
  const reasons = Array.isArray(parsed.reasons)
    ? parsed.reasons.filter((r): r is string => typeof r === 'string').slice(0, 3)
    : [];
  const traits = Array.isArray(parsed.traits)
    ? parsed.traits.filter((t): t is string => typeof t === 'string').slice(0, 6)
    : [];
  return {
    alignment: normalized,
    confidence,
    reasons: reasons.length ? reasons : ['Your choices sound heroic and kind.'],
    traits,
  };
}

export function getOpenAIClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAI({ apiKey: key });
}

export async function describeSelfieFacialFeatures(
  openai: OpenAI,
  dataUrl: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Describe this person\'s face for an image model that must recreate the SAME identity: face shape, eye color/shape/spacing, nose, mouth, jawline, hair color/length/style, skin tone, approximate age. Be precise. Do NOT describe clothing. Do NOT name celebrities. Reply with 4-6 short phrases separated by semicolons.',
          },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 120,
  });
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('Could not read facial features from your photo.');
  }
  return text;
}

/** @deprecated Use describeSelfieFacialFeatures */
export async function describeSelfieForCartoon(
  openai: OpenAI,
  dataUrl: string
): Promise<string | null> {
  try {
    return await describeSelfieFacialFeatures(openai, dataUrl);
  } catch {
    return null;
  }
}

export interface SuperheroImageJobInput {
  mode: 'student' | 'admin';
  selfie_data_url: string;
  bundle?: SuperheroAiBundle | null;
}

export async function loadBundleForSuperheroImageJob(
  sql: NeonQueryFunction<false, false>,
  job: {
    user_id: string | null;
    student_lesson_id: string | null;
    input_json: unknown;
  }
): Promise<SuperheroAiBundle> {
  const input = (job.input_json || {}) as Partial<SuperheroImageJobInput>;
  if (!input.selfie_data_url?.startsWith('data:image/')) {
    throw new Error('Job is missing selfie photo');
  }

  if (input.mode === 'admin' && input.bundle) {
    return { ...input.bundle, selfie_data_url: input.selfie_data_url };
  }

  if (!job.user_id || !job.student_lesson_id) {
    throw new Error('Invalid job configuration');
  }

  const bundle = await loadBundleForStudentLesson(sql, job.user_id, job.student_lesson_id);
  bundle.selfie_data_url = input.selfie_data_url;
  return bundle;
}

export async function resolveSuperheroAiBundle(
  event: { headers?: { cookie?: string } },
  body: { studentLessonId?: string; bundle?: unknown; selfie_data_url?: string }
): Promise<{
  bundle: SuperheroAiBundle;
  mode: 'student' | 'admin';
  userId?: string;
  studentLessonId?: string;
}> {
  const inlineBundle = body.bundle ? parseBundleInput(body.bundle) : null;

  if (inlineBundle) {
    const admin = await requireAdminAuth(event);
    if (!admin.ok) {
      throw new Error('Admin authentication required for test bundle');
    }
    if (
      typeof body.selfie_data_url === 'string' &&
      body.selfie_data_url.startsWith('data:image/')
    ) {
      inlineBundle.selfie_data_url = body.selfie_data_url;
    }
    return { bundle: inlineBundle, mode: 'admin' };
  }

  if (!body.studentLessonId) {
    throw new Error('studentLessonId or bundle is required');
  }

  const auth = await requireStudentAuth(event);
  if (!auth.ok) {
    throw new Error(auth.error || 'Authentication required');
  }

  const databaseUrl = process.env.NEON_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Database configuration error');
  }

  const sql = neon(databaseUrl);
  const bundle = await loadBundleForStudentLesson(sql, auth.user.id, body.studentLessonId);
  if (
    typeof body.selfie_data_url === 'string' &&
    body.selfie_data_url.startsWith('data:image/')
  ) {
    bundle.selfie_data_url = body.selfie_data_url;
  }
  return {
    bundle,
    mode: 'student',
    userId: auth.user.id,
    studentLessonId: body.studentLessonId,
  };
}
