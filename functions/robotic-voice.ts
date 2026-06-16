/**
 * Robotic / TTS voice detector (Google Translate speak, AI voice playback).
 *
 * v2.2 vs v2.1:
 *  - Skip logprob bucket when Whisper emits identical avg_logprob per segment (artifact)
 *  - Logprob rules require logprob_range > 0 (non-artifact variance)
 *  - high_boundary_pauses only when logprob bucket already scored
 *  - regular_energy removed from score (logged only)
 *  - filler_absence: +5 weak corroboration when logprob fired and word_count >= 20
 *  - confidence uses bucket count × score, not raw rule count
 *
 * Log-only by default; blocking requires ROBOTIC_VOICE_MODE=block.
 */

export const ROBOTIC_VOICE_SCORER_VERSION = 'v2.2.1'

export interface BrowserRhythmInput {
  speech_rate?: number
  pause_variance?: number
  pause_entropy?: number
  pitch_variance?: number
  energy_variance?: number
  voiced_ratio?: number
  energy_autocorr_lag1?: number
  energy_autocorr_lag3?: number
}

export interface WhisperSegment {
  start?: number
  end?: number
  text?: string
  avg_logprob?: number
  no_speech_prob?: number
  compression_ratio?: number
}

export interface WhisperVerboseInput {
  text?: string
  duration?: number
  language?: string
  segments?: WhisperSegment[]
}

export interface RoboticVoiceFeaturesInput {
  whisper_verbose?: WhisperVerboseInput | null
  browser_rhythm?: BrowserRhythmInput | null
  /** speech_jobs.prompt_id — improvement read-aloud is excluded from would-flag */
  prompt_id?: string | null
}

export interface RoboticVoiceResult {
  score: number
  flagged: boolean
  confidence: number
  message: string
  signals: Record<string, number | boolean | string | string[]>
  _mode: 'log' | 'block'
  _scorer_version: string
}

const FILLER_WORDS = new Set(['um', 'uh', 'er', 'ah', 'like', 'erm', 'hmm'])

const FLAG_THRESHOLD = 85
const MIN_WORDS_FOR_STRICT_RULES = 10
const MIN_WORDS_FOR_FILLER_ABSENCE = 20
const MIN_SEGMENTS_FOR_LOGPROB_RULES = 5
const LOGPROB_BUCKET_CAP = 40
const LOGPROB_EQUAL_EPSILON = 1e-6
// If Whisper reports identical avg_logprob per segment, treat short answers as low-information.
// For longer audio, constant logprobs can still be a meaningful signal (especially for TTS).
const MAX_SEGMENTS_FOR_ALL_EQUAL_SKIP = 4
const MIN_SEGMENTS_TO_ALLOW_RANGE_ZERO = 8

/** Whisper sometimes repeats the same avg_logprob on every segment (human speech FP in v2). */
function isLogprobArtifact(logprobs: number[]): boolean {
  if (logprobs.length < 2) return false
  const first = logprobs[0]
  return logprobs.every((lp) => Math.abs(lp - first) < LOGPROB_EQUAL_EPSILON)
}

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean <= 0) return null
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function boundaryPauseRatio(segments: WhisperSegment[]): number | null {
  if (segments.length < 2) return null
  let gaps = 0
  let atBoundary = 0
  for (let i = 0; i < segments.length - 1; i++) {
    const end = Number(segments[i]?.end)
    const nextStart = Number(segments[i + 1]?.start)
    if (!Number.isFinite(end) || !Number.isFinite(nextStart) || nextStart <= end) continue
    gaps += 1
    const text = (segments[i]?.text || '').trim()
    if (/[.?!,;:]\s*$/.test(text)) atBoundary += 1
  }
  if (gaps === 0) return null
  return atBoundary / gaps
}

function whisperDerived(whisper: WhisperVerboseInput | null | undefined) {
  const text = typeof whisper?.text === 'string' ? whisper.text : ''
  const words = text.trim().split(/\s+/).filter(Boolean)
  const wordCount = words.length
  const segments = Array.isArray(whisper?.segments) ? whisper.segments : []

  const durations: number[] = []
  const gaps: number[] = []
  const logprobs: number[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const start = Number(seg?.start)
    const end = Number(seg?.end)
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      durations.push(end - start)
    }
    if (i < segments.length - 1) {
      const nextStart = Number(segments[i + 1]?.start)
      if (Number.isFinite(end) && Number.isFinite(nextStart) && nextStart > end) {
        gaps.push(nextStart - end)
      }
    }
    const lp = Number(seg?.avg_logprob)
    if (Number.isFinite(lp)) logprobs.push(lp)
  }

  let fillerCount = 0
  for (const w of words) {
    const cleaned = w.toLowerCase().replace(/[^a-z']/g, '')
    if (FILLER_WORDS.has(cleaned)) fillerCount += 1
  }

  const artifact = isLogprobArtifact(logprobs)

  const meanLogprob =
    logprobs.length > 0
      ? logprobs.reduce((a, b) => a + b, 0) / logprobs.length
      : null
  const minLogprob = logprobs.length > 0 ? Math.min(...logprobs) : null
  const maxLogprob = logprobs.length > 0 ? Math.max(...logprobs) : null
  const stdLogprob = stdDev(logprobs)
  const logprobRange =
    minLogprob != null && maxLogprob != null ? maxLogprob - minLogprob : null

  return {
    word_count: wordCount,
    filler_ratio: wordCount > 0 ? fillerCount / wordCount : 0,
    filler_count: fillerCount,
    segment_duration_cv: coefficientOfVariation(durations),
    inter_segment_gap_cv: coefficientOfVariation(gaps),
    mean_logprob: meanLogprob,
    min_logprob: minLogprob,
    max_logprob: maxLogprob,
    std_logprob: stdLogprob,
    logprob_range: logprobRange,
    boundary_pause_ratio: boundaryPauseRatio(segments),
    segment_count: segments.length,
    logprob_is_artifact: artifact,
  }
}

function getMode(): 'log' | 'block' {
  return process.env.ROBOTIC_VOICE_MODE === 'block' ? 'block' : 'log'
}

function ruleBucket(rule: string): string {
  if (
    rule === 'uniform_asr_ease' ||
    rule === 'easy_asr_mean' ||
    rule === 'no_hard_segments' ||
    rule === 'tts_logprob_combo'
  ) {
    return 'whisper_logprob'
  }
  if (rule === 'high_boundary_pauses') return 'pause_placement'
  if (rule === 'filler_absence') return 'filler'
  return rule
}

function scoreLogprobBucket(
  w: ReturnType<typeof whisperDerived>,
  enoughSpeech: boolean
): { points: number; rulesHit: string[]; rawPoints: number } {
  // Many human answers end up with identical avg_logprob across a few segments.
  // Treat those short answers as low-information instead of scoring them as TTS.
  if (w.logprob_is_artifact && w.segment_count <= MAX_SEGMENTS_FOR_ALL_EQUAL_SKIP) {
    return { points: 0, rulesHit: [], rawPoints: 0 }
  }

  const enoughLogprobSegments = w.segment_count >= MIN_SEGMENTS_FOR_LOGPROB_RULES
  const allowRangeZero = w.segment_count >= MIN_SEGMENTS_TO_ALLOW_RANGE_ZERO
  const hasTightRange =
    w.logprob_range != null &&
    (w.logprob_range > 0 || allowRangeZero) &&
    w.logprob_range < 0.05
  const hasModerateRange =
    w.logprob_range != null &&
    (w.logprob_range > 0 || allowRangeZero) &&
    w.logprob_range < 0.08

  const candidates: Array<{ rule: string; points: number; match: boolean }> = [
    {
      rule: 'tts_logprob_combo',
      points: 20,
      match:
        enoughSpeech &&
        enoughLogprobSegments &&
        w.std_logprob != null &&
        w.std_logprob < 0.12 &&
        w.mean_logprob != null &&
        w.mean_logprob > -0.4 &&
        w.min_logprob != null &&
        w.min_logprob > -0.55 &&
        hasTightRange,
    },
    {
      rule: 'uniform_asr_ease',
      points: 35,
      match:
        enoughSpeech &&
        enoughLogprobSegments &&
        hasTightRange &&
        w.std_logprob != null &&
        w.std_logprob < 0.08,
    },
    {
      rule: 'no_hard_segments',
      points: 25,
      match:
        enoughLogprobSegments &&
        w.min_logprob != null &&
        w.min_logprob > -0.5 &&
        w.std_logprob != null &&
        w.std_logprob < 0.12 &&
        hasModerateRange,
    },
    {
      rule: 'easy_asr_mean',
      points: 25,
      match:
        enoughSpeech &&
        enoughLogprobSegments &&
        w.mean_logprob != null &&
        w.mean_logprob > -0.37 &&
        hasModerateRange,
    },
  ]

  const rulesHit: string[] = []
  let points = 0
  let rawPoints = 0

  for (const c of candidates) {
    if (!c.match) continue
    rawPoints += c.points
    if (points >= LOGPROB_BUCKET_CAP) continue
    const add = Math.min(c.points, LOGPROB_BUCKET_CAP - points)
    points += add
    rulesHit.push(c.rule)
  }

  return { points, rulesHit, rawPoints }
}

function computeConfidence(score: number, bucketCount: number, wouldFlag: boolean): number {
  if (bucketCount === 0) return 0
  const bucketFactor = Math.min(1, bucketCount / 2)
  const scoreFactor = Math.min(1, score / FLAG_THRESHOLD)
  const flagBoost = wouldFlag ? 0.1 : 0
  return Math.min(1, bucketFactor * scoreFactor + flagBoost)
}

export interface RoboticVoiceDbColumns {
  score: number | null
  would_flag: boolean | null
  flagged: boolean | null
  rules: string[] | null
}

export function roboticVoiceToDbColumns(rv: RoboticVoiceResult | null): RoboticVoiceDbColumns {
  if (!rv) {
    return { score: null, would_flag: null, flagged: null, rules: null }
  }
  const rulesHit = rv.signals.rules_hit
  const rules = Array.isArray(rulesHit)
    ? rulesHit.filter((r): r is string => typeof r === 'string')
    : []
  return {
    score: rv.score,
    would_flag: Boolean(rv.signals.would_flag),
    flagged: rv.flagged,
    rules: rules.length > 0 ? rules : null,
  }
}

export function computeRoboticVoiceScore(input: RoboticVoiceFeaturesInput): RoboticVoiceResult {
  const mode = getMode()
  const rhythm = input.browser_rhythm || null
  const w = whisperDerived(input.whisper_verbose)
  const promptId = typeof input.prompt_id === 'string' ? input.prompt_id.trim() : ''
  const isImprovementReadAloud = promptId === 'improvement'

  const energyAutocorrLag1 =
    typeof rhythm?.energy_autocorr_lag1 === 'number' && Number.isFinite(rhythm.energy_autocorr_lag1)
      ? rhythm.energy_autocorr_lag1
      : null
  const energyAutocorrLag3 =
    typeof rhythm?.energy_autocorr_lag3 === 'number' && Number.isFinite(rhythm.energy_autocorr_lag3)
      ? rhythm.energy_autocorr_lag3
      : null

  const rulesHit: string[] = []
  const enoughSpeech = w.word_count >= MIN_WORDS_FOR_STRICT_RULES
  const enoughSegments = w.segment_count >= 3

  const logprob = scoreLogprobBucket(w, enoughSpeech)
  rulesHit.push(...logprob.rulesHit)
  let score = logprob.points

  const skipBoundaryPauseRule =
    w.boundary_pause_ratio != null &&
    w.boundary_pause_ratio >= 1 &&
    w.segment_count <= 6

  if (
    logprob.points > 0 &&
    !skipBoundaryPauseRule &&
    enoughSegments &&
    w.boundary_pause_ratio != null &&
    w.boundary_pause_ratio > 0.65
  ) {
    score += 15
    rulesHit.push('high_boundary_pauses')
  }

  if (
    logprob.points > 0 &&
    w.word_count >= MIN_WORDS_FOR_FILLER_ABSENCE &&
    w.filler_count === 0
  ) {
    score += 5
    rulesHit.push('filler_absence')
  }

  score = Math.min(100, score)

  const buckets = new Set(rulesHit.map(ruleBucket))
  const bucketCount = buckets.size
  const hasSubstantiveBucket = buckets.has('whisper_logprob')

  let wouldFlag = score >= FLAG_THRESHOLD && bucketCount >= 2 && hasSubstantiveBucket
  if (isImprovementReadAloud) {
    wouldFlag = false
  }

  const confidence = computeConfidence(score, bucketCount, wouldFlag)
  const flagged = mode === 'block' && wouldFlag

  const message = flagged
    ? 'This sounds like a computer voice. Please record yourself speaking.'
    : wouldFlag
      ? '[log] Would flag robotic voice'
      : ''

  return {
    score,
    flagged,
    confidence,
    message,
    signals: {
      scorer_version: ROBOTIC_VOICE_SCORER_VERSION,
      logprob_is_artifact: w.logprob_is_artifact,
      std_logprob: w.std_logprob ?? -1,
      min_logprob: w.min_logprob ?? -99,
      max_logprob: w.max_logprob ?? -99,
      logprob_range: w.logprob_range ?? -1,
      mean_logprob: w.mean_logprob ?? -99,
      boundary_pause_ratio: w.boundary_pause_ratio ?? -1,
      segment_duration_cv: w.segment_duration_cv ?? -1,
      inter_segment_gap_cv: w.inter_segment_gap_cv ?? -1,
      filler_ratio: w.filler_ratio,
      filler_count: w.filler_count,
      word_count: w.word_count,
      segment_count: w.segment_count,
      energy_autocorr_lag1: energyAutocorrLag1 ?? -1,
      energy_autocorr_lag3: energyAutocorrLag3 ?? -1,
      pitch_variance: typeof rhythm?.pitch_variance === 'number' ? rhythm.pitch_variance : -1,
      pause_entropy: typeof rhythm?.pause_entropy === 'number' ? rhythm.pause_entropy : -1,
      logprob_bucket_score: logprob.points,
      logprob_bucket_raw: logprob.rawPoints,
      skip_boundary_pause_rule: skipBoundaryPauseRule,
      has_substantive_bucket: hasSubstantiveBucket,
      skip_would_flag_improvement: isImprovementReadAloud,
      rules_hit: rulesHit,
      would_flag: wouldFlag,
    },
    _mode: mode,
    _scorer_version: ROBOTIC_VOICE_SCORER_VERSION,
  }
}
