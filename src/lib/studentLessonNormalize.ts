import type { StudentVocabularyItem } from '@/types/student'

function parseJsonArray(raw: unknown): unknown[] {
  if (raw == null) return []
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return Array.isArray(raw) ? raw : []
}

/** Normalize vocabulary rows from get-student-lesson (handles stringified JSON arrays). */
export function parseStudentVocabularyItems(raw: unknown): StudentVocabularyItem[] {
  const items: StudentVocabularyItem[] = []
  for (const row of parseJsonArray(raw)) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const english =
      (typeof r.english_word === 'string' && r.english_word) ||
      (typeof r.englishWord === 'string' && r.englishWord) ||
      ''
    if (!english.trim()) continue
    items.push({
      id: String(r.id ?? ''),
      activity_id: String(r.activity_id ?? r.activityId ?? ''),
      english_word: english.trim(),
      thai_translation: (r.thai_translation ?? r.thaiTranslation) as string | null | undefined,
      audio_url: (r.audio_url ?? r.audioUrl) as string | null | undefined,
      image_url: (r.image_url ?? r.imageUrl) as string | null | undefined,
      emoji: (r.emoji as string | null | undefined) ?? null,
      category: (r.category as string | null | undefined) ?? null,
      sort_order: Number(r.sort_order ?? r.sortOrder ?? 0),
      created_at: r.created_at as string | undefined,
    })
  }
  return items.sort((a, b) => a.sort_order - b.sort_order)
}

/** Lesson 1 picture-match pairs when DB rows are missing (e.g. seed not applied). */
export const LESSON1_PICTURE_MATCH_WORDS = [
  'play games',
  'listen to music',
  'chat',
  'stream',
] as const

export function lesson1PictureMatchFallbackItems(
  activityId: string
): StudentVocabularyItem[] {
  return LESSON1_PICTURE_MATCH_WORDS.map((word, index) => ({
    id: `lesson1-picture-${index}`,
    activity_id: activityId,
    english_word: word,
    sort_order: index + 1,
  }))
}
