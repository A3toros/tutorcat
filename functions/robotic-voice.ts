/**
 * Robotic / TTS voice detector (Google Translate speak, AI voice playback).
 *
 * v2.3.5 (production human FP fix 2026-06-23):
 *  - GTTS-hard multi path requires logprob_is_artifact (exact equal), not near-flat rehearsed speech
 *  - Single-segment: crystal mean > -0.30; admin band (-0.32,-0.30] needs rhythm
 *  - Skip boundary_pause bonus when ratio=1 and not exact artifact (rehearsed human pattern)
 *
 * v2.3.4: multi-segment rhythm-only removed for 2-seg; GTTS-hard for multi (too broad — fixed in v2.3.5)
 *
 * v2.3.3: single-segment easy ASR, filler list fix, ultra-flat pitch bonus.
 *
 * Log-only by default; blocking requires ROBOTIC_VOICE_MODE=block.
 */

export const ROBOTIC_VOICE_SCORER_VERSION = 'v2.3.5'

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

const FILLER_WORDS = new Set(['um', 'uh', 'er', 'ah', 'erm', 'hmm'])

const FLAG_THRESHOLD = 70
const MIN_WORDS_FOR_STRICT_RULES = 10
const MIN_WORDS_FOR_FILLER_ABSENCE = 20
const MIN_WORDS_FOR_ARTIFACT_TTS = 15
const MIN_WORDS_FOR_ARTIFACT_TTS_SHORT = 12
const MIN_WORDS_FOR_FILLER_WHEN_TTS = 12
const MIN_SEGMENTS_FOR_LOGPROB_RULES = 5
const MIN_SEGMENTS_FOR_ARTIFACT_TTS = 5
const LOGPROB_BUCKET_CAP = 40
const ARTIFACT_TTS_BUCKET_CAP = 55
const ARTIFACT_TTS_SHORT_BUCKET_CAP = 58
const LOGPROB_EQUAL_EPSILON = 1e-6
const LOGPROB_NEAR_FLAT_MAX_RANGE = 0.025
const MAX_SEGMENTS_FOR_ALL_EQUAL_SKIP = 4
const MIN_SEGMENTS_TO_ALLOW_RANGE_ZERO = 8

function isNearFlatLogprob(logprobs: number[]): boolean {
  if (logprobs.length < 2) return false
  const min = Math.min(...logprobs)
  const max = Math.max(...logprobs)
  return max - min < LOGPROB_NEAR_FLAT_MAX_RANGE
}

function isFlatLikeLogprob(w: ReturnType<typeof whisperDerived>): boolean {
  return w.logprob_is_artifact || w.logprob_is_near_flat
}

/** Whisper sometimes repeats the same avg_logprob on every segment. */
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
  const nearFlat = isNearFlatLogprob(logprobs)

  const meanLogprob =
    logprobs.length > 0 ? logprobs.reduce((a, b) => a + b, 0) / logprobs.length : null
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
    logprob_is_near_flat: nearFlat,
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
    rule === 'tts_logprob_combo' ||
    rule === 'tts_flat_logprob' ||
    rule === 'tts_flat_logprob_short' ||
    rule === 'tts_easy_single_segment'
  ) {
    return 'whisper_logprob'
  }
  if (rule === 'high_boundary_pauses') return 'pause_placement'
  if (rule === 'filler_absence') return 'filler'
  if (rule === 'low_pitch_tts') return 'pitch'
  return rule
}

function easyAsrFlatLogprob(w: ReturnType<typeof whisperDerived>): boolean {
  if (w.mean_logprob == null || w.min_logprob == null) return false
  return (
    w.mean_logprob > -0.45 &&
    w.min_logprob > -0.58 &&
    (w.std_logprob == null || w.std_logprob < 0.02)
  )
}

/** Easy ASR on a single Whisper segment (ChatGPT TTS admin samples ≈ -0.29 to -0.33). */
function veryEasyAsrSingleSegment(w: ReturnType<typeof whisperDerived>): boolean {
  if (w.mean_logprob == null || w.min_logprob == null) return false
  return w.mean_logprob > -0.34 && w.min_logprob > -0.4
}

/** Stricter band for 3–4 segment short answers — avoids human at ≈ -0.32. */
function veryEasyAsrMultiSegment(w: ReturnType<typeof whisperDerived>): boolean {
  if (w.mean_logprob == null || w.min_logprob == null) return false
  return w.mean_logprob > -0.3 && w.min_logprob > -0.38
}

/** 2-segment GTTS band (admin ≈ -0.328); rhythm-only corroboration removed in v2.3.4. */
function veryEasyAsrTwoSegment(w: ReturnType<typeof whisperDerived>): boolean {
  if (w.mean_logprob == null || w.min_logprob == null) return false
  return w.mean_logprob > -0.33 && w.min_logprob > -0.38
}

/** Admin single-segment TTS band (ChatGPT ≈ -0.30 to -0.32); rhythm required. */
function isAdminTtsSingleBand(w: ReturnType<typeof whisperDerived>): boolean {
  return (
    w.mean_logprob != null &&
    w.mean_logprob > -0.32 &&
    w.mean_logprob <= -0.3
  )
}

/** Crystal-clear single-segment TTS (very high Whisper confidence, ≈ -0.29). */
function isCrystalClearSingleTts(w: ReturnType<typeof whisperDerived>): boolean {
  return w.mean_logprob != null && w.mean_logprob > -0.3
}

/** GTTS often sits below rehearsed human flat speech; require exact artifact, not near-flat drift. */
function isGtssLikeHardAsr(w: ReturnType<typeof whisperDerived>): boolean {
  return (
    w.logprob_is_artifact &&
    w.mean_logprob != null &&
    w.mean_logprob <= -0.4
  )
}

/** @deprecated alias used in signals */
function veryEasyAsrFlatLogprob(w: ReturnType<typeof whisperDerived>): boolean {
  return w.segment_count <= 1 ? veryEasyAsrSingleSegment(w) : veryEasyAsrMultiSegment(w)
}

function hasTtsRhythmCorroboration(rhythm: BrowserRhythmInput | null): boolean {
  const pv = rhythm?.pitch_variance
  const e1 = rhythm?.energy_autocorr_lag1
  if (typeof pv === 'number' && Number.isFinite(pv) && pv >= 0 && pv < 0.035) return true
  if (typeof e1 === 'number' && Number.isFinite(e1) && e1 > 0.68) return true
  return false
}

function shortTtsCorroborated(
  w: ReturnType<typeof whisperDerived>,
  rhythm: BrowserRhythmInput | null,
  mode: 'single' | 'two_segment' | 'multi_segment'
): boolean {
  if (mode === 'two_segment') {
    return veryEasyAsrTwoSegment(w)
  }
  if (mode === 'multi_segment') {
    if (veryEasyAsrMultiSegment(w)) return true
    return hasTtsRhythmCorroboration(rhythm) && isGtssLikeHardAsr(w)
  }
  if (isCrystalClearSingleTts(w)) return true
  if (hasTtsRhythmCorroboration(rhythm) && isAdminTtsSingleBand(w)) return true
  return false
}

function allowLowPitchTtsBonus(w: ReturnType<typeof whisperDerived>): boolean {
  if (w.segment_count === 1) return isAdminTtsSingleBand(w) || isCrystalClearSingleTts(w)
  if (w.segment_count === 2) return veryEasyAsrTwoSegment(w)
  return w.logprob_is_artifact && w.mean_logprob != null && w.mean_logprob <= -0.4
}

/** Google Translate / AI TTS playback scoring. */
function scoreArtifactTtsBucket(
  w: ReturnType<typeof whisperDerived>,
  enoughSpeech: boolean,
  rhythm: BrowserRhythmInput | null
): { points: number; rulesHit: string[]; rawPoints: number; shortSkippedNoCorroboration?: boolean } {
  if (!enoughSpeech) {
    return { points: 0, rulesHit: [], rawPoints: 0 }
  }

  // ChatGPT TTS often collapses to a single Whisper segment.
  if (w.segment_count === 1 && w.word_count >= MIN_WORDS_FOR_ARTIFACT_TTS_SHORT) {
    if (w.mean_logprob != null && w.mean_logprob > -0.35) {
      const rhythmPitch =
        typeof rhythm?.pitch_variance === 'number' &&
        Number.isFinite(rhythm.pitch_variance) &&
        rhythm.pitch_variance >= 0 &&
        rhythm.pitch_variance < 0.035
      if (shortTtsCorroborated(w, rhythm, 'single')) {
        const rawPoints = isCrystalClearSingleTts(w) ? 58 : rhythmPitch ? 55 : 48
        return {
          points: rawPoints,
          rulesHit: ['tts_easy_single_segment'],
          rawPoints,
        }
      }
      return { points: 0, rulesHit: [], rawPoints: 0, shortSkippedNoCorroboration: true }
    }
    return { points: 0, rulesHit: [], rawPoints: 0 }
  }

  if (!isFlatLikeLogprob(w)) {
    return { points: 0, rulesHit: [], rawPoints: 0 }
  }
  if (!easyAsrFlatLogprob(w)) {
    return { points: 0, rulesHit: [], rawPoints: 0 }
  }

  if (
    w.segment_count >= MIN_SEGMENTS_FOR_ARTIFACT_TTS &&
    w.word_count >= MIN_WORDS_FOR_ARTIFACT_TTS
  ) {
    const rawPoints = 55
    return {
      points: Math.min(ARTIFACT_TTS_BUCKET_CAP, rawPoints),
      rulesHit: ['tts_flat_logprob'],
      rawPoints,
    }
  }

  if (
    w.segment_count >= 3 &&
    w.segment_count <= MAX_SEGMENTS_FOR_ALL_EQUAL_SKIP &&
    w.word_count >= MIN_WORDS_FOR_ARTIFACT_TTS_SHORT
  ) {
    if (!shortTtsCorroborated(w, rhythm, 'multi_segment')) {
      return { points: 0, rulesHit: [], rawPoints: 0, shortSkippedNoCorroboration: true }
    }
    const rawPoints = 50
    return {
      points: Math.min(ARTIFACT_TTS_SHORT_BUCKET_CAP, rawPoints),
      rulesHit: ['tts_flat_logprob_short'],
      rawPoints,
    }
  }

  if (w.segment_count === 2 && w.word_count >= MIN_WORDS_FOR_ARTIFACT_TTS_SHORT) {
    if (!shortTtsCorroborated(w, rhythm, 'two_segment')) {
      return { points: 0, rulesHit: [], rawPoints: 0, shortSkippedNoCorroboration: true }
    }
    const rawPoints = 55
    return {
      points: Math.min(ARTIFACT_TTS_SHORT_BUCKET_CAP, rawPoints),
      rulesHit: ['tts_flat_logprob_short'],
      rawPoints,
    }
  }

  return { points: 0, rulesHit: [], rawPoints: 0 }
}

function scoreLogprobBucket(
  w: ReturnType<typeof whisperDerived>,
  enoughSpeech: boolean
): { points: number; rulesHit: string[]; rawPoints: number } {
  // Short flat/near-flat answers use scoreArtifactTtsBucket instead.
  if (isFlatLikeLogprob(w) && w.segment_count <= MAX_SEGMENTS_FOR_ALL_EQUAL_SKIP) {
    return { points: 0, rulesHit: [], rawPoints: 0 }
  }
  // Long flat-logprob answers use scoreArtifactTtsBucket instead.
  if (isFlatLikeLogprob(w) && w.segment_count >= MIN_SEGMENTS_FOR_ARTIFACT_TTS) {
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

  const pitchVariance =
    typeof rhythm?.pitch_variance === 'number' && Number.isFinite(rhythm.pitch_variance)
      ? rhythm.pitch_variance
      : null
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
  const enoughSegmentsForPause = w.segment_count >= 2

  const artifactTts = scoreArtifactTtsBucket(w, enoughSpeech, rhythm)
  const logprob = scoreLogprobBucket(w, enoughSpeech)

  rulesHit.push(...artifactTts.rulesHit, ...logprob.rulesHit)
  let score = artifactTts.points + logprob.points

  const logprobBucketActive = artifactTts.points > 0 || logprob.points > 0

  const skipBoundaryPauseRule =
    w.boundary_pause_ratio != null &&
    w.boundary_pause_ratio >= 1 &&
    w.segment_count <= 6 &&
    (artifactTts.points === 0 || !w.logprob_is_artifact)

  if (
    logprobBucketActive &&
    !skipBoundaryPauseRule &&
    enoughSegmentsForPause &&
    w.boundary_pause_ratio != null &&
    w.boundary_pause_ratio > 0.65
  ) {
    score += 15
    rulesHit.push('high_boundary_pauses')
  }

  if (
    logprobBucketActive &&
    w.word_count >=
      (artifactTts.points > 0 ? MIN_WORDS_FOR_FILLER_WHEN_TTS : MIN_WORDS_FOR_FILLER_ABSENCE) &&
    w.filler_count === 0
  ) {
    score += 5
    rulesHit.push('filler_absence')
  }

  const allowLowPitchTts = allowLowPitchTtsBonus(w)
  if (
    allowLowPitchTts &&
    artifactTts.points >= 38 &&
    pitchVariance != null &&
    pitchVariance < 0.02 &&
    pitchVariance >= 0
  ) {
    score += pitchVariance < 0.002 ? 15 : 10
    rulesHit.push('low_pitch_tts')
  }

  score = Math.min(100, score)

  const buckets = new Set(rulesHit.map(ruleBucket))
  const bucketCount = buckets.size
  const hasSubstantiveBucket = buckets.has('whisper_logprob')
  const hasStrongArtifactTts =
    artifactTts.rulesHit.includes('tts_flat_logprob') ||
    artifactTts.rulesHit.includes('tts_flat_logprob_short') ||
    artifactTts.rulesHit.includes('tts_easy_single_segment')

  let wouldFlag =
    score >= FLAG_THRESHOLD &&
    hasSubstantiveBucket &&
    (bucketCount >= 2 || hasStrongArtifactTts)
  if (isImprovementReadAloud) {
    wouldFlag = false
  }

  const scoreSkipReason =
    artifactTts.shortSkippedNoCorroboration
      ? 'artifact_short_no_corroboration'
      : w.logprob_is_artifact &&
          w.segment_count <= MAX_SEGMENTS_FOR_ALL_EQUAL_SKIP &&
          score === 0
        ? 'artifact_short_skip'
        : w.segment_count < MIN_SEGMENTS_FOR_LOGPROB_RULES && score === 0
          ? w.segment_count === 1
            ? 'single_segment_no_match'
            : 'too_few_segments'
          : score === 0 && w.logprob_is_artifact
            ? 'artifact_no_match'
            : score > 0
              ? hasStrongArtifactTts
                ? artifactTts.rulesHit.includes('tts_easy_single_segment')
                  ? 'artifact_tts_single_scored'
                  : artifactTts.rulesHit.includes('tts_flat_logprob_short')
                    ? 'artifact_tts_short_scored'
                    : 'artifact_tts_scored'
                : 'variable_logprob_scored'
              : 'other_zero'

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
      score_skip_reason: scoreSkipReason,
      logprob_is_artifact: w.logprob_is_artifact,
      logprob_is_near_flat: w.logprob_is_near_flat,
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
      pitch_variance: pitchVariance ?? -1,
      pause_entropy: typeof rhythm?.pause_entropy === 'number' ? rhythm.pause_entropy : -1,
      artifact_tts_bucket_score: artifactTts.points,
      logprob_bucket_score: logprob.points,
      logprob_bucket_raw: logprob.rawPoints,
      skip_boundary_pause_rule: skipBoundaryPauseRule,
      has_substantive_bucket: hasSubstantiveBucket,
      has_strong_artifact_tts: hasStrongArtifactTts,
      rhythm_corroborated: hasTtsRhythmCorroboration(rhythm),
      very_easy_asr: veryEasyAsrFlatLogprob(w),
      skip_would_flag_improvement: isImprovementReadAloud,
      rules_hit: rulesHit,
      would_flag: wouldFlag,
    },
    _mode: mode,
    _scorer_version: ROBOTIC_VOICE_SCORER_VERSION,
  }
}
