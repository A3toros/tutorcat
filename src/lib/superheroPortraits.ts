import type { GenderPool, HeroId } from '@/lib/lesson4SuperheroQuiz'

/** Portrait files under `public/superhero/male/` and `public/superhero/female/`. */
const MALE = '/superhero/male'
const FEMALE = '/superhero/female'

function assetPath(folder: string, filename: string): string {
  return encodeURI(`${folder}/${filename}`)
}

/** Exact filenames on disk (teacher assets). */
export const SUPERHERO_PORTRAIT_FILE: Record<HeroId, string> = {
  aquaman: assetPath(MALE, 'aquaman.png'),
  peacemaker: assetPath(MALE, 'peacemaker.png'),
  superman: assetPath(MALE, 'superman.png'),
  batman: assetPath(MALE, 'batman 1.png'),
  joker: assetPath(MALE, 'joker.png'),
  wonder_woman: assetPath(FEMALE, 'wonder woman.png'),
  supergirl: assetPath(FEMALE, 'supergirl.png'),
  batgirl: assetPath(FEMALE, 'batgirl.png'),
  catwoman: assetPath(FEMALE, 'catgirl.png'),
  harley_quinn: assetPath(FEMALE, 'Harley.png'),
}

const PORTRAIT_FOLDER: Record<GenderPool, string> = {
  boy: MALE,
  girl: FEMALE,
}

export function portraitFolderForGender(gender: GenderPool): string {
  return PORTRAIT_FOLDER[gender]
}

/** Primary portrait URL for a hero. */
export function portraitUrlForHero(heroId: HeroId): string {
  return SUPERHERO_PORTRAIT_FILE[heroId]
}

/** Primary URL plus optional jpg fallback for legacy uploads. */
export function portraitUrlCandidates(heroId: HeroId): string[] {
  const primary = SUPERHERO_PORTRAIT_FILE[heroId]
  const folder = heroId === 'wonder_woman' || heroId === 'supergirl' || heroId === 'batgirl' || heroId === 'catwoman' || heroId === 'harley_quinn' ? FEMALE : MALE
  const base = primary.split('/').pop()?.replace(/\.(png|jpe?g|webp)$/i, '') ?? heroId
  const decodedBase = decodeURIComponent(base)
  return [
    primary,
    assetPath(folder, `${decodedBase}.jpg`),
    assetPath(folder, `${decodedBase}.jpeg`),
  ]
}
