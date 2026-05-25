/** Wikimedia Commons Special:FilePath — redirects to the correct upload.wikimedia.org URL. */
export function commonsImage(filename: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`
}

/**
 * Lesson 1 vocabulary — filenames verified on Commons (GET via Special:FilePath).
 * Twemoji12 uses direct upload URLs (correct hash paths; avoids 404s from wrong hashes).
 */
export const LESSON1_VOCAB_IMAGE_FILES: Record<string, string> = {
  app: 'OOjs_UI_icon_advanced.svg',
  website: 'Globe_icon.svg',
  phone: 'Twemoji12_1f4f1.svg',
  tablet: 'Twemoji12_1f4fb.svg',
  computer: 'Emoji_u1f4bb.svg',
  internet: 'Wifi.svg',
  chat: 'OOjs_UI_icon_speechBubble-ltr-progressive.svg',
  message: 'OOjs_UI_icon_message-progressive.svg',
  call: 'Telephone icon blue gradient.svg',
  'watch videos': 'YouTube full-color icon (2017).svg',
  'play games': 'Twemoji12_1f3ae.svg',
  'listen to music': 'Twemoji12_1f3a7.svg',
  stream: 'Youtube icon.svg',
  post: 'OOjs_UI_icon_share-progressive.svg',
  search: 'OOjs_UI_icon_search-ltr-progressive.svg',
  scroll: 'Twemoji12_1f4f2.svg',
  download: 'Icon Download Black.svg',
  upload: 'Twemoji12_1f4e4.svg',
  fun: 'Smiley.svg',
  boring: 'Twemoji12_1f634.svg',
  interesting: 'Light bulb icon red.svg',
  useful: 'OOjs UI icon check-constructive.svg',
  funny: 'Twemoji12_1f606.svg',
  exciting: 'OOjs_UI_icon_star.svg',
}

/** Direct upload URLs for Twemoji12 (stable hashes from Commons imageinfo). */
const TWEMOJI12_DIRECT: Record<string, string> = {
  'Twemoji12_1f4f1.svg':
    'https://upload.wikimedia.org/wikipedia/commons/4/4a/Twemoji12_1f4f1.svg',
  'Twemoji12_1f4fb.svg':
    'https://upload.wikimedia.org/wikipedia/commons/8/89/Twemoji12_1f4fb.svg',
  'Twemoji12_1f3ae.svg':
    'https://upload.wikimedia.org/wikipedia/commons/6/65/Twemoji12_1f3ae.svg',
  'Twemoji12_1f3a7.svg':
    'https://upload.wikimedia.org/wikipedia/commons/7/7f/Twemoji12_1f3a7.svg',
  'Twemoji12_1f4f2.svg':
    'https://upload.wikimedia.org/wikipedia/commons/9/98/Twemoji12_1f4f2.svg',
  'Twemoji12_1f4e4.svg':
    'https://upload.wikimedia.org/wikipedia/commons/e/e7/Twemoji12_1f4e4.svg',
  'Twemoji12_1f634.svg':
    'https://upload.wikimedia.org/wikipedia/commons/4/40/Twemoji12_1f634.svg',
  'Twemoji12_1f606.svg':
    'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg',
}

function fileToImageUrl(filename: string): string {
  return TWEMOJI12_DIRECT[filename] ?? commonsImage(filename)
}

export function lesson1VocabImageUrl(englishWord: string): string {
  const key = englishWord.trim().toLowerCase()
  const file = LESSON1_VOCAB_IMAGE_FILES[key]
  return file ? fileToImageUrl(file) : ''
}

/** Prefer canonical lesson-1 map; ignore stale/broken DB upload paths. */
export function resolveStudentVocabImageUrl(
  englishWord: string,
  dbUrl?: string | null,
): string {
  const mapped = lesson1VocabImageUrl(englishWord)
  if (mapped) return mapped
  if (!dbUrl) return ''
  if (dbUrl.includes('commons.wikimedia.org/wiki/Special:FilePath/')) return dbUrl
  return dbUrl
}
