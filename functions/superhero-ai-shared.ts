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
  const selfie = byOrder.get(14);

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

  const skippedSelfie = selfie?.skipped === true;
  const selfieDataUrl =
    !skippedSelfie && typeof selfie?.selfie_data_url === 'string'
      ? selfie.selfie_data_url
      : null;

  return {
    quiz_matched_hero_id:
      typeof quiz?.matched_hero_id === 'string' ? quiz.matched_hero_id : undefined,
    quiz_match_why: typeof quiz?.match_why === 'string' ? quiz.match_why : undefined,
    profile_sentences: profileSentences,
    profile_slots: profileSlots,
    character_description: profileSentences.join('\n'),
    moral_summary: moralSummary,
    selfie_data_url: selfieDataUrl,
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

export function buildImagePrompt(bundle: SuperheroAiBundle, selfieHints: string | null): string {
  const lines = [
    'Original comic-book superhero character for an English class project.',
    'Student character description:',
    bundle.character_description,
  ];
  if (bundle.moral_summary.length) {
    lines.push('Moral choices (context only):', bundle.moral_summary.join('; '));
  }
  if (selfieHints) {
    lines.push(`Cartoon look hints (generic, not a real person): ${selfieHints}`);
  }
  lines.push(
    'Style: colorful cartoon illustration, full body, dynamic heroic pose, plain light background.',
    'Do NOT depict any existing copyrighted character, celebrity, or trademarked hero.',
    'Do NOT include text, logos, or watermarks.'
  );
  return lines.join('\n');
}

export function assertSelfiePresent(bundle: SuperheroAiBundle): void {
  if (!bundle.selfie_data_url?.startsWith('data:image/')) {
    throw new Error('Add your hero face photo first (activity #14).');
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

export async function describeSelfieForCartoon(
  openai: OpenAI,
  dataUrl: string
): Promise<string | null> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'For a children\'s cartoon superhero illustration, describe only generic features: hair color/style, approximate age group, expression mood. Do NOT name real people or celebrities. Maximum two short phrases.',
          },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
        ],
      },
    ],
    max_tokens: 80,
  });
  return response.choices[0]?.message?.content?.trim() || null;
}

export async function resolveSuperheroAiBundle(
  event: { headers?: { cookie?: string } },
  body: { studentLessonId?: string; bundle?: unknown }
): Promise<{ bundle: SuperheroAiBundle; mode: 'student' | 'admin' }> {
  const inlineBundle = body.bundle ? parseBundleInput(body.bundle) : null;

  if (inlineBundle) {
    const admin = await requireAdminAuth(event);
    if (!admin.ok) {
      throw new Error('Admin authentication required for test bundle');
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
  return { bundle, mode: 'student' };
}
