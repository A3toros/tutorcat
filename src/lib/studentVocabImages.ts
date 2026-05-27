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
  'Twemoji12_1f4c8.svg':
    'https://upload.wikimedia.org/wikipedia/commons/b/be/Twemoji12_1f4c8.svg',
  'Twemoji12_1f3c6.svg':
    'https://upload.wikimedia.org/wikipedia/commons/a/a1/Twemoji12_1f3c6.svg',
  'Twemoji12_1f4f9.svg':
    'https://upload.wikimedia.org/wikipedia/commons/5/52/Twemoji12_1f4f9.svg',
  'Twemoji12_23-20e3.svg':
    'https://upload.wikimedia.org/wikipedia/commons/e/e3/Twemoji12_23-20e3.svg',
  'Twemoji12_1f465.svg':
    'https://upload.wikimedia.org/wikipedia/commons/8/8c/Twemoji12_1f465.svg',
  'Twemoji12_1f525.svg':
    'https://upload.wikimedia.org/wikipedia/commons/9/98/Twemoji12_1f525.svg',
  'Twemoji12_1f440.svg':
    'https://upload.wikimedia.org/wikipedia/commons/b/b6/Twemoji12_1f440.svg',
  'Twemoji12_1f464.svg':
    'https://upload.wikimedia.org/wikipedia/commons/b/b3/Twemoji12_1f464.svg',
  'Twemoji12_2764.svg':
    'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_2764.svg',
  'Twemoji_270f.svg':
    'https://upload.wikimedia.org/wikipedia/commons/f/f4/Twemoji_270f.svg',
  'Twemoji12_1f914.svg':
    'https://upload.wikimedia.org/wikipedia/commons/d/d1/Twemoji12_1f914.svg',
  'Twemoji12_1f60e.svg':
    'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_1f60e.svg',
}

/** Verified upload.wikimedia.org URLs (from Commons Special:FilePath redirects). */
const COMMONS_FILE_DIRECT: Record<string, string> = {
  'OOjs_UI_icon_advanced.svg':
    'https://upload.wikimedia.org/wikipedia/commons/0/05/OOjs_UI_icon_advanced.svg',
  'Globe_icon.svg':
    'https://upload.wikimedia.org/wikipedia/commons/c/c4/Globe_icon.svg',
  'Emoji_u1f4bb.svg':
    'https://upload.wikimedia.org/wikipedia/commons/d/d7/Emoji_u1f4bb.svg',
  'Wifi.svg': 'https://upload.wikimedia.org/wikipedia/commons/9/9e/Wifi.svg',
  'OOjs_UI_icon_speechBubble-ltr-progressive.svg':
    'https://upload.wikimedia.org/wikipedia/commons/f/f2/OOjs_UI_icon_speechBubble-ltr-progressive.svg',
  'OOjs_UI_icon_message-progressive.svg':
    'https://upload.wikimedia.org/wikipedia/commons/7/7e/OOjs_UI_icon_message-progressive.svg',
  'Telephone icon blue gradient.svg':
    'https://upload.wikimedia.org/wikipedia/commons/b/b8/Telephone_icon_blue_gradient.svg',
  'Youtube icon.svg':
    'https://upload.wikimedia.org/wikipedia/commons/2/21/YouTube_icon_%282011-2013%29.svg',
  'OOjs_UI_icon_share-progressive.svg':
    'https://upload.wikimedia.org/wikipedia/commons/0/09/OOjs_UI_icon_share-progressive.svg',
  'Smiley.svg': 'https://upload.wikimedia.org/wikipedia/commons/8/85/Smiley.svg',
  'Light_bulb_icon_red.svg':
    'https://upload.wikimedia.org/wikipedia/commons/8/84/Light_bulb_icon_red.svg',
  'OOjs_UI_icon_star.svg':
    'https://upload.wikimedia.org/wikipedia/commons/9/99/OOjs_UI_icon_star.svg',
  'YouTube_full-color_icon_(2017).svg':
    'https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg',
}

function fileToImageUrl(filename: string): string {
  return (
    TWEMOJI12_DIRECT[filename] ??
    COMMONS_FILE_DIRECT[filename] ??
    commonsImage(filename)
  )
}

/** Fast path: direct URL per lesson-1 word (picture match + vocab intro). */
export const LESSON1_IMAGE_URL_BY_WORD: Record<string, string> = {
  app: COMMONS_FILE_DIRECT['OOjs_UI_icon_advanced.svg'],
  website: COMMONS_FILE_DIRECT['Globe_icon.svg'],
  phone: TWEMOJI12_DIRECT['Twemoji12_1f4f1.svg'],
  tablet: TWEMOJI12_DIRECT['Twemoji12_1f4fb.svg'],
  computer: COMMONS_FILE_DIRECT['Emoji_u1f4bb.svg'],
  internet: COMMONS_FILE_DIRECT['Wifi.svg'],
  chat: COMMONS_FILE_DIRECT['OOjs_UI_icon_speechBubble-ltr-progressive.svg'],
  message: COMMONS_FILE_DIRECT['OOjs_UI_icon_message-progressive.svg'],
  call: COMMONS_FILE_DIRECT['Telephone icon blue gradient.svg'],
  'watch videos': commonsImage('YouTube full-color icon (2017).svg'),
  'play games': TWEMOJI12_DIRECT['Twemoji12_1f3ae.svg'],
  'listen to music': TWEMOJI12_DIRECT['Twemoji12_1f3a7.svg'],
  stream: COMMONS_FILE_DIRECT['Youtube icon.svg'],
  post: COMMONS_FILE_DIRECT['OOjs_UI_icon_share-progressive.svg'],
  search: fileToImageUrl('OOjs_UI_icon_search-ltr-progressive.svg'),
  scroll: TWEMOJI12_DIRECT['Twemoji12_1f4f2.svg'],
  download: fileToImageUrl('Icon Download Black.svg'),
  upload: TWEMOJI12_DIRECT['Twemoji12_1f4e4.svg'],
  fun: COMMONS_FILE_DIRECT['Smiley.svg'],
  boring: TWEMOJI12_DIRECT['Twemoji12_1f634.svg'],
  interesting: fileToImageUrl('Light bulb icon red.svg'),
  useful: fileToImageUrl('OOjs UI icon check-constructive.svg'),
  funny: TWEMOJI12_DIRECT['Twemoji12_1f606.svg'],
  exciting: fileToImageUrl('OOjs_UI_icon_star.svg'),
}

/** Lesson 2 — verified direct URLs (Commons API, May 2026). */
export const LESSON2_IMAGE_URL_BY_WORD: Record<string, string> = {
  meme: TWEMOJI12_DIRECT['Twemoji12_1f606.svg'],
  trend: TWEMOJI12_DIRECT['Twemoji12_1f4c8.svg'],
  challenge: TWEMOJI12_DIRECT['Twemoji12_1f3c6.svg'],
  video: COMMONS_FILE_DIRECT['YouTube_full-color_icon_(2017).svg'],
  creator: TWEMOJI12_DIRECT['Twemoji12_1f4f9.svg'],
  stream: COMMONS_FILE_DIRECT['Youtube icon.svg'],
  hashtag: TWEMOJI12_DIRECT['Twemoji12_23-20e3.svg'],
  comment: COMMONS_FILE_DIRECT['OOjs_UI_icon_speechBubble-ltr-progressive.svg'],
  follower: TWEMOJI12_DIRECT['Twemoji12_1f465.svg'],
  viral: TWEMOJI12_DIRECT['Twemoji12_1f525.svg'],
  watch: TWEMOJI12_DIRECT['Twemoji12_1f440.svg'],
  share: COMMONS_FILE_DIRECT['OOjs_UI_icon_share-progressive.svg'],
  follow: TWEMOJI12_DIRECT['Twemoji12_1f464.svg'],
  post: COMMONS_FILE_DIRECT['OOjs_UI_icon_share-progressive.svg'],
  react: TWEMOJI12_DIRECT['Twemoji12_2764.svg'],
  create: TWEMOJI12_DIRECT['Twemoji_270f.svg'],
  funny: TWEMOJI12_DIRECT['Twemoji12_1f606.svg'],
  weird: TWEMOJI12_DIRECT['Twemoji12_1f914.svg'],
  cool: TWEMOJI12_DIRECT['Twemoji12_1f60e.svg'],
  boring: TWEMOJI12_DIRECT['Twemoji12_1f634.svg'],
  interesting: COMMONS_FILE_DIRECT['Light_bulb_icon_red.svg'],
  popular: COMMONS_FILE_DIRECT['OOjs_UI_icon_star.svg'],
}

export function lesson2VocabImageUrl(englishWord: string): string {
  const key = englishWord.trim().toLowerCase()
  return LESSON2_IMAGE_URL_BY_WORD[key] || ''
}

export function lesson1VocabImageUrl(englishWord: string): string {
  const key = englishWord.trim().toLowerCase()
  const direct = LESSON1_IMAGE_URL_BY_WORD[key]
  if (direct) return direct
  const file = LESSON1_VOCAB_IMAGE_FILES[key]
  return file ? fileToImageUrl(file) : ''
}

/** Prefer canonical lesson-1 direct URLs; ignore stale/broken DB paths. */
export function resolveStudentVocabImageUrl(
  englishWord: string,
  dbUrl?: string | null,
): string {
  const mapped = lesson2VocabImageUrl(englishWord) || lesson1VocabImageUrl(englishWord)
  if (mapped) return mapped
  if (!dbUrl) return ''
  if (dbUrl.includes('upload.wikimedia.org/')) return dbUrl
  if (dbUrl.includes('commons.wikimedia.org/wiki/Special:FilePath/')) {
    const filename = decodeURIComponent(
      dbUrl.split('/Special:FilePath/')[1]?.split('?')[0] ?? '',
    )
    if (filename) {
      const fromFile = fileToImageUrl(filename)
      if (!fromFile.includes('/wiki/Special:FilePath/')) return fromFile
    }
    return dbUrl
  }
  return dbUrl
}
