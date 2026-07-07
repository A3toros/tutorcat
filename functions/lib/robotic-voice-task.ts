/**
 * Task-context gate for robotic-voice v2.4+.
 * Decides what delivery we expect before acoustic classifiers run.
 */

export type TaskDeliveryExpectation = 'spontaneous' | 'reading'

export interface RoboticVoiceTaskContext {
  /** speech_jobs.prompt_id — e.g. prompt-0, improvement, topic-wheel-3 */
  prompt_id?: string | null
  /** Lesson activity type when available — e.g. speaking_with_feedback */
  activity_type?: string | null
  /** Question / topic shown to the student */
  prompt_text?: string | null
  /** Script the student should read aloud (improvement target text, etc.) */
  reference_text?: string | null
}

export interface ResolvedTaskContext {
  expectation: TaskDeliveryExpectation
  /** Improvement read-aloud — never would-flag robotic/TTS playback */
  skip_tts_would_flag: boolean
  /** Human-readable reason for admin signals */
  task_reason: string
  /** Fraction of prompt tokens found in transcript (0–1), when prompt present */
  prompt_overlap: number | null
  /** Fraction of reference tokens found in transcript (0–1) */
  reference_overlap: number | null
}

const READING_ACTIVITY_TYPES = new Set([
  'speaking_improvement',
  'language_improvement_reading',
  'student_speaking_improvement',
  'reading_improvement',
])

const SPONTANEOUS_ACTIVITY_TYPES = new Set([
  'speaking_with_feedback',
  'speaking_practice',
  'warm_up_speaking',
  'student_speaking_cards',
  'student_challenge_wheel',
  'student_warmup_poll',
])

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tokens length ≥ 3 to ignore "a", "the", etc. */
export function tokenizeForOverlap(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((w) => w.length >= 3)
}

export function tokenOverlapRatio(haystack: string, needle: string): number {
  const needleTokens = tokenizeForOverlap(needle)
  if (needleTokens.length === 0) return 0
  const haySet = new Set(tokenizeForOverlap(haystack))
  let hits = 0
  for (const t of needleTokens) {
    if (haySet.has(t)) hits += 1
  }
  return hits / needleTokens.length
}

export function resolveTaskContext(
  task: RoboticVoiceTaskContext,
  transcript: string
): ResolvedTaskContext {
  const promptId = typeof task.prompt_id === 'string' ? task.prompt_id.trim() : ''
  const activityType =
    typeof task.activity_type === 'string' ? task.activity_type.trim().toLowerCase() : ''
  const promptText = typeof task.prompt_text === 'string' ? task.prompt_text.trim() : ''
  const referenceText = typeof task.reference_text === 'string' ? task.reference_text.trim() : ''

  const promptOverlap = promptText ? tokenOverlapRatio(transcript, promptText) : null
  const referenceOverlap = referenceText ? tokenOverlapRatio(transcript, referenceText) : null

  if (promptId === 'improvement' || READING_ACTIVITY_TYPES.has(activityType)) {
    return {
      expectation: 'reading',
      skip_tts_would_flag: true,
      task_reason: 'improvement_or_reading_activity',
      prompt_overlap: promptOverlap,
      reference_overlap: referenceOverlap,
    }
  }

  if (activityType && SPONTANEOUS_ACTIVITY_TYPES.has(activityType)) {
    return {
      expectation: 'spontaneous',
      skip_tts_would_flag: false,
      task_reason: 'spontaneous_activity_type',
      prompt_overlap: promptOverlap,
      reference_overlap: referenceOverlap,
    }
  }

  if (promptId.includes('-wheel-') || promptId.includes('wheel')) {
    return {
      expectation: 'spontaneous',
      skip_tts_would_flag: false,
      task_reason: 'wheel_topic_prompt',
      prompt_overlap: promptOverlap,
      reference_overlap: referenceOverlap,
    }
  }

  // Platform speaking cards default to spontaneous answer expected.
  return {
    expectation: 'spontaneous',
    skip_tts_would_flag: false,
    task_reason: 'default_spontaneous',
    prompt_overlap: promptOverlap,
    reference_overlap: referenceOverlap,
  }
}

/** Task-inappropriate reading: student largely repeats the question on a spontaneous task. */
export function isTaskInappropriateReading(
  task: ResolvedTaskContext,
  transcript: string,
  promptText: string
): boolean {
  if (task.expectation !== 'spontaneous') return false
  if (!promptText.trim()) return false
  const overlap = task.prompt_overlap ?? tokenOverlapRatio(transcript, promptText)
  return overlap >= 0.55
}
