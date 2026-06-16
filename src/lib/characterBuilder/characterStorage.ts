import type { CharacterSelections } from '@/lib/characterBuilder/characterConfig'
import { sampleCharacterSelections } from '@/lib/characterBuilder/characterConfig'
import type { StudentActivityResult, StudentLessonActivity } from '@/types/student'
import { getCharacterBuilderAnswers } from './lessonCharacterData'

export type StoredCharacter = CharacterSelections & {
  characterName?: string
  preview_image?: string
  sourceActivityOrder: number
  savedAt: string
}

export type ResolvedCharacter = CharacterSelections & {
  characterName?: string
  preview_image?: string
  /** True when no saved character — showing a stable sample for this lesson. */
  isSample: boolean
}

const PREFIX = 'student-character'

function storageKey(userId: string, lessonId: string) {
  return `${PREFIX}-${userId}-${lessonId}`
}

export function saveStoredCharacter(
  userId: string,
  lessonId: string,
  data: Omit<StoredCharacter, 'savedAt'>
) {
  if (typeof window === 'undefined') return
  try {
    const payload: StoredCharacter = { ...data, savedAt: new Date().toISOString() }
    localStorage.setItem(storageKey(userId, lessonId), JSON.stringify(payload))
  } catch (e) {
    console.warn('saveStoredCharacter failed', e)
  }
}

export function loadStoredCharacter(
  userId: string,
  lessonId: string,
  sourceActivityOrder?: number
): StoredCharacter | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(userId, lessonId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredCharacter
    if (sourceActivityOrder != null && parsed.sourceActivityOrder !== sourceActivityOrder) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function resolveSourceActivityOrder(
  activities: StudentLessonActivity[] | undefined,
  sourceActivityOrder?: number
): number {
  if (sourceActivityOrder != null) return sourceActivityOrder
  const builder = activities?.find((a) => a.activity_type === 'student_character_builder')
  return builder?.activity_order ?? 1
}

/**
 * Saved character: localStorage → lesson activity results (DB `student_lesson_activity_results.answers`).
 * No separate character table — builder step stores full JSON on activity 1.
 */
export function resolveCharacterForStory(options: {
  lessonId: string
  userId?: string | null
  activityResults?: StudentActivityResult[]
  activities?: StudentLessonActivity[]
  sourceActivityOrder?: number
}): (CharacterSelections & { characterName?: string; preview_image?: string }) | null {
  const order = resolveSourceActivityOrder(options.activities, options.sourceActivityOrder)
  const userId = options.userId?.trim() || 'guest'

  const fromLocal = loadStoredCharacter(userId, options.lessonId, order)
  if (fromLocal) {
    const { savedAt: _s, sourceActivityOrder: _o, ...character } = fromLocal
    return character
  }

  return getCharacterBuilderAnswers(options.activityResults, options.activities, order)
}

/** localStorage → DB → stable random sample for this lesson. */
export function resolveCharacterWithFallback(options: {
  lessonId: string
  userId?: string | null
  activityResults?: StudentActivityResult[]
  activities?: StudentLessonActivity[]
  sourceActivityOrder?: number
}): ResolvedCharacter {
  const saved = resolveCharacterForStory(options)
  if (saved) return { ...saved, isSample: false }

  const userId = options.userId?.trim() || 'guest'
  return {
    ...sampleCharacterSelections(`${options.lessonId}:${userId}`),
    isSample: true,
  }
}
