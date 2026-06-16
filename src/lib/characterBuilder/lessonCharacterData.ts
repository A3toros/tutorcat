import { AVATAR_LAYER_DEFS, isValidAssetId } from '@/lib/characterBuilder/avatarAssets'
import type { CharacterSelections } from '@/lib/characterBuilder/characterConfig'
import { DEFAULT_CHARACTER_SELECTIONS } from '@/lib/characterBuilder/characterConfig'
import type { StudentActivityResult, StudentLessonActivity } from '@/types/student'

function parseCharacterAnswers(a: Record<string, unknown>): CharacterSelections | null {
  const base: Partial<CharacterSelections> = {}
  for (const def of AVATAR_LAYER_DEFS) {
    const raw = a[def.id]
    if (typeof raw !== 'string' || !isValidAssetId(def, raw)) return null
    base[def.id] = raw
  }
  return base as CharacterSelections
}

export function getCharacterBuilderAnswers(
  activityResults: StudentActivityResult[] | undefined,
  activities: StudentLessonActivity[] | undefined,
  sourceActivityOrder?: number
): (CharacterSelections & { characterName?: string; preview_image?: string }) | null {
  if (!activityResults?.length) return null

  let order = sourceActivityOrder
  if (order == null && activities?.length) {
    const builder = activities.find((a) => a.activity_type === 'student_character_builder')
    order = builder?.activity_order
  }
  if (order == null) order = 1

  const row = activityResults.find(
    (r) =>
      Number(r.activityOrder) === Number(order) &&
      r.activityType === 'student_character_builder'
  )
  if (!row?.answers || typeof row.answers !== 'object') return null

  const a = row.answers as Record<string, unknown>
  const parsed = parseCharacterAnswers(a)
  if (!parsed) return null

  return {
    ...parsed,
    characterName: typeof a.characterName === 'string' ? a.characterName : undefined,
    preview_image: typeof a.preview_image === 'string' ? a.preview_image : undefined,
  }
}

export { DEFAULT_CHARACTER_SELECTIONS }
