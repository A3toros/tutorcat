/**
 * Character builder — full avatar_maker layer stack (SideA order).
 * body → skin → mouth → eyes → hair → features → shoes → bottom → top → extra
 */

import {
  AVATAR_LAYER_DEFS,
  AVATAR_NONE,
  assetId,
  assetUrl,
  defById,
  isValidAssetId,
  thumbUrl,
  type AvatarLayerCategoryId,
  type AvatarLayerDef,
} from './avatarAssets'

export type CharacterCategoryId = AvatarLayerCategoryId

export type CharacterSelections = {
  skin: string
  eyes: string
  mouth: string
  hair: string
  top: string
  bottom: string
  shoes: string
  features: string
  extra: string
  characterName?: string
}

export type CharacterOption = {
  id: string
  label: string
  thumbUrl?: string
}

export type CharacterCategory = {
  id: CharacterCategoryId
  label: string
  required: boolean
  options: CharacterOption[]
}

export type CharacterLayerStack = {
  skin: string
  mouth: string
  eyes: string
  hair: string | null
  features: string | null
  shoes: string | null
  bottom: string | null
  top: string
  extra: string | null
}

export const CHARACTER_BASE = {
  body: '/characters/body/body.png',
  empty: '/characters/empty.png',
  removeThumb: '/characters/remove.svg',
}

function buildOptions(def: AvatarLayerDef): CharacterOption[] {
  const options: CharacterOption[] = []
  if (def.optional) {
    options.push({ id: AVATAR_NONE, label: 'None', thumbUrl: CHARACTER_BASE.removeThumb })
  }
  for (let i = 1; i <= def.count; i++) {
    options.push({
      id: assetId(def.prefix, i),
      label: String(i),
      thumbUrl: thumbUrl(def, i),
    })
  }
  return options
}

export const CHARACTER_CATEGORIES: CharacterCategory[] = AVATAR_LAYER_DEFS.map((def) => ({
  id: def.id,
  label: def.label,
  required: !def.optional,
  options: buildOptions(def),
}))

export function resolveCharacterLayers(selection: Partial<CharacterSelections>): CharacterLayerStack | null {
  for (const def of AVATAR_LAYER_DEFS) {
    const id = selection[def.id]
    if (!id || !isValidAssetId(def, id)) return null
  }

  const skin = assetUrl(defById('skin'), selection.skin!)!
  const eyes = assetUrl(defById('eyes'), selection.eyes!)!
  const mouth = assetUrl(defById('mouth'), selection.mouth!)!
  const top = assetUrl(defById('top'), selection.top!)!

  return {
    skin,
    mouth,
    eyes,
    hair: assetUrl(defById('hair'), selection.hair!),
    features: assetUrl(defById('features'), selection.features!),
    shoes: assetUrl(defById('shoes'), selection.shoes!),
    bottom: assetUrl(defById('bottom'), selection.bottom!),
    top,
    extra: assetUrl(defById('extra'), selection.extra!),
  }
}

export function isCharacterComplete(selection: Partial<CharacterSelections>): selection is CharacterSelections {
  return AVATAR_LAYER_DEFS.every((def) => {
    const id = selection[def.id]
    return typeof id === 'string' && isValidAssetId(def, id)
  })
}

export const DEFAULT_CHARACTER_SELECTIONS: CharacterSelections = {
  skin: 'skin01',
  eyes: 'eyes01',
  mouth: 'mouth01',
  hair: 'hair08',
  top: 'top01',
  bottom: 'bottom01',
  shoes: 'shoes01',
  features: AVATAR_NONE,
  extra: AVATAR_NONE,
}

/** Stable random character when the student has not saved one yet (same per user + lesson). */
export function sampleCharacterSelections(seed: string): CharacterSelections {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const next = { ...DEFAULT_CHARACTER_SELECTIONS }
  for (const cat of CHARACTER_CATEGORIES) {
    h = Math.imul(h ^ cat.options.length, 2654435761)
    const idx = (h >>> 0) % cat.options.length
    next[cat.id] = cat.options[idx]!.id
  }
  return next
}

/** Human-readable summary for story / review steps. */
export function formatCharacterSummary(selection: CharacterSelections): string[] {
  const line = (label: string, id: string) => {
    if (id === AVATAR_NONE) return null
    const num = id.match(/\d+$/)?.[0]
    return num ? `${label} ${Number(num)}` : `${label}: ${id}`
  }
  return [
    line('Skin', selection.skin),
    line('Eyes', selection.eyes),
    line('Mouth', selection.mouth),
    line('Hair', selection.hair),
    line('Top', selection.top),
    line('Bottom', selection.bottom),
    line('Shoes', selection.shoes),
    line('Features', selection.features),
    line('Extra', selection.extra),
  ].filter(Boolean) as string[]
}
