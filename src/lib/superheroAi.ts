import type { StudentActivityResult } from '@/types/student'

export type HeroAlignment = 'hero' | 'villain' | 'anti-hero'

export interface SuperheroProfileSlot {
  template?: string
  word: string
  sentence: string
}

export interface SuperheroAiBundle {
  quiz_matched_hero_id?: string
  quiz_match_why?: string
  profile_sentences: string[]
  profile_slots: SuperheroProfileSlot[]
  character_description: string
  moral_summary: string[]
  alignment?: HeroAlignment
  alignment_reasons?: string[]
  alignment_traits?: string[]
  selfie_data_url?: string | null
}

export interface ClassifyHeroAlignmentResult {
  alignment: HeroAlignment
  confidence: number
  reasons: string[]
  traits: string[]
  prompt_used?: string
}

export interface GenerateSuperheroImageResult {
  image_data_url: string | null
  image_url: string | null
  model: string
  prompt_used: string
  facial_features?: string | null
  look_design?: string | null
  why_chosen?: string | null
  generation_method?: 'edit' | 'generate' | null
  /** @deprecated use facial_features */
  selfie_hints?: string | null
}

function answersForOrder(
  results: StudentActivityResult[],
  order: number
): Record<string, unknown> | undefined {
  const row = results.find((r) => r.activityOrder === order)
  if (!row?.answers || typeof row.answers !== 'object') return undefined
  return row.answers as Record<string, unknown>
}

export function buildSuperheroAiBundleFromResults(
  results: StudentActivityResult[]
): SuperheroAiBundle {
  const quiz = answersForOrder(results, 7)
  const profile = answersForOrder(results, 11)
  const moral = answersForOrder(results, 12)
  const alignmentRow = answersForOrder(results, 14)

  const profileSlots: SuperheroProfileSlot[] = []
  const rawSentences = profile?.sentences
  if (Array.isArray(rawSentences)) {
    for (const row of rawSentences) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const sentence = typeof r.sentence === 'string' ? r.sentence : ''
      const word = typeof r.word === 'string' ? r.word : ''
      if (!sentence) continue
      profileSlots.push({
        template: typeof r.template === 'string' ? r.template : undefined,
        word,
        sentence,
      })
    }
  }

  const profileSentences = profileSlots.map((s) => s.sentence)
  const moralSummary: string[] = []
  const moralPrompts = moral?.prompts
  if (Array.isArray(moralPrompts)) {
    for (const row of moralPrompts) {
      if (!row || typeof row !== 'object') continue
      const r = row as Record<string, unknown>
      const prompt = typeof r.prompt === 'string' ? r.prompt : ''
      const transcript = typeof r.transcript === 'string' ? r.transcript.trim() : ''
      if (prompt && transcript) {
        moralSummary.push(`${prompt} → ${transcript}`)
      } else if (prompt) {
        moralSummary.push(prompt)
      }
    }
  }

  const alignmentRaw =
    typeof alignmentRow?.alignment_ai === 'string' ? alignmentRow.alignment_ai.toLowerCase() : ''
  const alignment: HeroAlignment | undefined =
    alignmentRaw === 'hero' || alignmentRaw === 'villain' || alignmentRaw === 'anti-hero'
      ? alignmentRaw
      : undefined
  const alignmentReason =
    typeof alignmentRow?.alignment_ai_reason === 'string' ? alignmentRow.alignment_ai_reason.trim() : ''
  const alignmentTraits = Array.isArray(alignmentRow?.alignment_ai_traits)
    ? alignmentRow.alignment_ai_traits.filter((t): t is string => typeof t === 'string')
    : []

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
  }
}

export const SAMPLE_SUPERHERO_BUNDLE: SuperheroAiBundle = {
  profile_sentences: [
    'My hero can control fire.',
    "My hero can't turn invisible.",
    'My hero is loyal.',
    'My hero wants to fight.',
    'My hero is faster than a normal person.',
  ],
  profile_slots: [
    { template: 'My hero can {word}.', word: 'control fire', sentence: 'My hero can control fire.' },
    {
      template: "My hero can't {word}.",
      word: 'turn invisible',
      sentence: "My hero can't turn invisible.",
    },
    { template: 'My hero is {word}.', word: 'loyal', sentence: 'My hero is loyal.' },
    { template: 'My hero wants to {word}.', word: 'fight', sentence: 'My hero wants to fight.' },
    {
      template: 'My hero is {word} than a normal person.',
      word: 'faster',
      sentence: 'My hero is faster than a normal person.',
    },
  ],
  character_description:
    'My hero can control fire.\nMy hero can\'t turn invisible.\nMy hero is loyal.\nMy hero wants to fight.\nMy hero is faster than a normal person.',
  moral_summary: [
    'A villain steals a wallet on the street. What would you do? → I would tell a teacher and try to stop them.',
  ],
  selfie_data_url: null,
}

export function hasSuperheroSelfie(bundle: SuperheroAiBundle): boolean {
  return Boolean(bundle.selfie_data_url?.startsWith('data:image/'))
}

function apiBase(): string {
  if (typeof window === 'undefined') return ''
  return process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:8888'
}

export async function classifyHeroAlignmentRequest(opts: {
  studentLessonId?: string
  bundle?: SuperheroAiBundle
  useAdminApi?: boolean
}): Promise<{ success: boolean; data?: ClassifyHeroAlignmentResult; error?: string }> {
  const body: Record<string, unknown> = {}
  if (opts.bundle) body.bundle = opts.bundle
  else if (opts.studentLessonId) body.studentLessonId = opts.studentLessonId
  else return { success: false, error: 'Missing lesson or profile data.' }

  const url = `${apiBase()}/.netlify/functions/classify-hero-alignment`
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  }

  const res = opts.useAdminApi
    ? await (await import('@/utils/adminApi')).adminApiRequest(url, init)
    : await fetch(url, init)
  const data = await res.json()
  if (!res.ok || !data?.success) {
    return { success: false, error: data?.error || 'Classification failed' }
  }
  return { success: true, data: data.data as ClassifyHeroAlignmentResult }
}

export async function generateSuperheroImageRequest(opts: {
  studentLessonId?: string
  bundle?: SuperheroAiBundle
  selfie_data_url?: string | null
  useAdminApi?: boolean
  onPollStatus?: (status: 'processing' | 'generating') => void
}): Promise<{ success: boolean; data?: GenerateSuperheroImageResult; error?: string }> {
  const body: Record<string, unknown> = {}
  if (opts.bundle) {
    body.bundle = opts.bundle
  } else if (opts.studentLessonId) {
    body.studentLessonId = opts.studentLessonId
    if (opts.selfie_data_url) body.selfie_data_url = opts.selfie_data_url
  } else {
    return { success: false, error: 'Missing lesson or profile data.' }
  }

  const jobUrl = `${apiBase()}/.netlify/functions/superhero-image-job`
  const jobInit: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  }

  const jobRes = opts.useAdminApi
    ? await (await import('@/utils/adminApi')).adminApiRequest(jobUrl, jobInit)
    : await fetch(jobUrl, jobInit)

  const jobData = await jobRes.json()
  if (!jobRes.ok || !jobData?.success) {
    return { success: false, error: jobData?.error || 'Failed to start portrait job' }
  }

  const jobId = jobData.jobId as string | undefined
  if (!jobId) {
    return { success: false, error: 'No job ID returned from server.' }
  }

  triggerSuperheroImageBackground(jobId)

  const pollOnce = async () => {
    const pollUrl = `${apiBase()}/.netlify/functions/superhero-image-result?id=${encodeURIComponent(jobId)}`
    const pollInit: RequestInit = { cache: 'no-store', credentials: 'include' }
    const pollRes = opts.useAdminApi
      ? await (await import('@/utils/adminApi')).adminApiRequest(pollUrl, pollInit)
      : await fetch(pollUrl, pollInit)
    const pollData = await pollRes.json()
    if (!pollRes.ok || pollData?.success === false) {
      throw new Error(pollData?.error || `Poll failed: ${pollRes.status}`)
    }
    return pollData as {
      status: string
      data?: GenerateSuperheroImageResult
      error?: string
    }
  }

  let poll = await pollOnce()
  const pollStarted = Date.now()
  while (poll.status === 'processing' || poll.status === 'generating') {
    if (Date.now() - pollStarted > SUPERHERO_IMAGE_POLL_MAX_MS) {
      return {
        success: false,
        error: 'Portrait generation is taking too long. Please try again in a moment.',
      }
    }
    opts.onPollStatus?.(poll.status === 'generating' ? 'generating' : 'processing')
    await new Promise((r) => setTimeout(r, getSuperheroImagePollDelayMs()))
    poll = await pollOnce()
  }

  if (poll.status === 'failed') {
    return { success: false, error: poll.error || 'Image generation failed' }
  }

  if (!poll.data?.image_data_url) {
    return { success: false, error: 'Image generation completed without image data.' }
  }

  return { success: true, data: poll.data }
}

const SUPERHERO_IMAGE_POLL_INTERVAL_MS = 2500
const SUPERHERO_IMAGE_POLL_INTERVAL_BACKGROUND_MS = 4000
const SUPERHERO_IMAGE_POLL_JITTER_MS = 500
const SUPERHERO_IMAGE_POLL_MAX_MS = 10 * 60 * 1000

function getSuperheroImagePollDelayMs(): number {
  const base =
    typeof document !== 'undefined' && document.visibilityState === 'visible'
      ? SUPERHERO_IMAGE_POLL_INTERVAL_MS
      : SUPERHERO_IMAGE_POLL_INTERVAL_BACKGROUND_MS
  return base + Math.floor(Math.random() * (SUPERHERO_IMAGE_POLL_JITTER_MS + 1))
}

function getSuperheroImageProcessPath(): string {
  const isDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  return isDev
    ? '/.netlify/functions/superhero-image-process'
    : '/.netlify/functions/run-superhero-image-background'
}

export function triggerSuperheroImageBackground(jobId: string): void {
  fetch(getSuperheroImageProcessPath(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  }).catch(() => {})
}
