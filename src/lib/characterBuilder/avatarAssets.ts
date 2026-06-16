/**
 * Avatar maker asset catalog — matches oliveira-victor/avatar_maker categories and counts.
 * @see https://github.com/oliveira-victor/avatar_maker
 */

export type AvatarLayerCategoryId =
  | 'skin'
  | 'eyes'
  | 'mouth'
  | 'hair'
  | 'top'
  | 'bottom'
  | 'shoes'
  | 'features'
  | 'extra'

export type AvatarLayerDef = {
  id: AvatarLayerCategoryId
  label: string
  count: number
  prefix: string
  folder: string
  optional: boolean
  thumbExt?: string
  assetExt?: string
}

export const AVATAR_LAYER_DEFS: AvatarLayerDef[] = [
  { id: 'skin', label: 'Skin', count: 9, prefix: 'skin', folder: 'skin', optional: false, thumbExt: 'jpg' },
  { id: 'eyes', label: 'Eyes', count: 27, prefix: 'eyes', folder: 'eyes', optional: false },
  { id: 'mouth', label: 'Mouth', count: 27, prefix: 'mouth', folder: 'mouth', optional: false },
  { id: 'hair', label: 'Hair', count: 36, prefix: 'hair', folder: 'hair', optional: true },
  { id: 'top', label: 'Top', count: 27, prefix: 'top', folder: 'top', optional: false },
  { id: 'bottom', label: 'Bottom', count: 26, prefix: 'bottom', folder: 'bottom', optional: true },
  { id: 'shoes', label: 'Shoes', count: 17, prefix: 'shoes', folder: 'shoes', optional: true },
  { id: 'features', label: 'Features', count: 8, prefix: 'features', folder: 'features', optional: true },
  { id: 'extra', label: 'Extra', count: 7, prefix: 'extra', folder: 'extra', optional: true, thumbExt: 'png', assetExt: 'gif' },
]

export const AVATAR_NONE = 'none'

export function padAssetNum(n: number): string {
  return String(n).padStart(2, '0')
}

export function assetId(prefix: string, n: number): string {
  return `${prefix}${padAssetNum(n)}`
}

export function assetUrl(def: AvatarLayerDef, id: string): string | null {
  if (id === AVATAR_NONE) return null
  const ext = def.assetExt ?? 'png'
  return `/characters/${def.folder}/${id}.${ext}`
}

export function thumbUrl(def: AvatarLayerDef, n: number): string {
  const thumbExt = def.thumbExt ?? def.assetExt ?? 'png'
  return `/characters/${def.folder}/thumb${padAssetNum(n)}.${thumbExt}`
}

export function defById(id: AvatarLayerCategoryId): AvatarLayerDef {
  const def = AVATAR_LAYER_DEFS.find((d) => d.id === id)
  if (!def) throw new Error(`Unknown avatar layer: ${id}`)
  return def
}

export function isValidAssetId(def: AvatarLayerDef, id: string): boolean {
  if (id === AVATAR_NONE) return def.optional
  const match = id.match(new RegExp(`^${def.prefix}(\\d{2})$`))
  if (!match) return false
  const n = Number(match[1])
  return n >= 1 && n <= def.count
}
