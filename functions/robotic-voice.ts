/**
 * Robotic / TTS voice detector (Google Translate speak, AI voice playback).
 * v2: segment logprob stats, pause-at-boundary, browser energy regularity.
 * Log-only by default; blocking requires ROBOTIC_VOICE_MODE=block.
 */

export const ROBOTIC_VOICE_SCORER_VERSION = 'v2'

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

const FLAG_THRESHOLD = 75
const MIN_WORDS_FOR_STRICT_RULES = 10

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean <= 0) return null
  const variance = values.reduce((sum, v) => {
    const d = v - mean
    return sum + d * d
  }, 0) / values.length
  return Math.sqrt(variance) / mean
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => {
    const d = v - mean
    return sum + d * d
  }, 0) / values.length
  return Math.sqrt(variance)
}

/** Fraction of inter-segment gaps that follow segment text ending in clause punctuation. */
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
    segment_duration_cv: coefficientOfVariation(durations),
    inter_segment_gap_cv: coefficientOfVariation(gaps),
    mean_logprob: meanLogprob,
    min_logprob: minLogprob,
    max_logprob: maxLogprob,
    std_logprob: stdLogprob,
    logprob_range: logprobRange,
    boundary_pause_ratio: boundaryPauseRatio(segments),
    segment_count: segments.length,
  }
}

function getMode(): 'log' | 'block' {
  return process.env.ROBOTIC_VOICE_MODE === 'block' ? 'block' : 'log'
}

function ruleBucket(rule: string): string {
  if (rule === 'uniform_asr_ease' || rule === 'easy_asr_mean' || rule === 'no_hard_segments' || rule === 'tts_logprob_combo') {
    return 'whisper_logprob'
  }
  if (rule === 'high_boundary_pauses') return 'pause_placement'
  if (rule === 'regular_energy') return 'energy_cadence'
  return rule
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
  const rules = Array.isArray(rulesHit) ? rulesHit.filter((r): r is string => typeof r === 'string') : []
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

  const energyAutocorrLag1 =
    typeof rhythm?.energy_autocorr_lag1 === 'number' && Number.isFinite(rhythm.energy_autocorr_lag1)
      ? rhythm.energy_autocorr_lag1
      : null
  const energyAutocorrLag3 =
    typeof rhythm?.energy_autocorr_lag3 === 'number' && Number.isFinite(rhythm.energy_autocorr_lag3)
      ? rhythm.energy_autocorr_lag3
      : null

  const rulesHit: string[] = []
  let score = 0

  const enoughSpeech = w.word_count >= MIN_WORDS_FOR_STRICT_RULES
  const enoughSegments = w.segment_count >= 3

  // Whisper finds TTS uniformly easy — low variance across segment logprobs.
  if (enoughSpeech && enoughSegments && w.std_logprob != null && w.std_logprob < 0.1) {
    score += 35
    rulesHit.push('uniform_asr_ease')
  }

  // TTS tends to have higher (less negative) mean logprob than disfluent human speech.
  if (enoughSpeech && w.mean_logprob != null && w.mean_logprob > -0.37) {
    score += 25
    rulesHit.push('easy_asr_mean')
  }

  // TTS rarely has very hard segments; humans have occasional disfluent chunks.
  if (
    enoughSegments &&
    w.min_logprob != null &&
    w.min_logprob > -0.5 &&
    w.std_logprob != null &&
    w.std_logprob < 0.15
  ) {
    score += 25
    rulesHit.push('no_hard_segments')
  }

  // Combined logprob signature (calibrated on early labeled batch).
  if (
    enoughSpeech &&
    enoughSegments &&
    w.std_logprob != null &&
    w.std_logprob < 0.12 &&
    w.mean_logprob != null &&
    w.mean_logprob > -0.4 &&
    w.min_logprob != null &&
    w.min_logprob > -0.55
  ) {
    score += 20
    rulesHit.push('tts_logprob_combo')
  }

  // Pauses that align with clause boundaries (Whisper segments often break at punctuation for TTS).
  if (
    enoughSegments &&
    w.boundary_pause_ratio != null &&
    w.boundary_pause_ratio > 0.65
  ) {
    score += 15
    rulesHit.push('high_boundary_pauses')
  }

  // Metronically regular energy envelope (browser time series).
  if (energyAutocorrLag1 != null && energyAutocorrLag1 > 0.55) {
    score += 20
    rulesHit.push('regular_energy')
  }
  if (
    energyAutocorrLag1 == null &&
    energyAutocorrLag3 != null &&
    energyAutocorrLag3 > 0.45
  ) {
    score += 10
    rulesHit.push('regular_energy')
  }

  score = Math.min(100, score)

  const bucketCount = new Set(rulesHit.map(ruleBucket)).size
  const confidence = Math.min(1, rulesHit.length / 4)
  const wouldFlag = score >= FLAG_THRESHOLD && bucketCount >= 2
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
      std_logprob: w.std_logprob ?? -1,
      min_logprob: w.min_logprob ?? -99,
      max_logprob: w.max_logprob ?? -99,
      logprob_range: w.logprob_range ?? -1,
      mean_logprob: w.mean_logprob ?? -99,
      boundary_pause_ratio: w.boundary_pause_ratio ?? -1,
      segment_duration_cv: w.segment_duration_cv ?? -1,
      inter_segment_gap_cv: w.inter_segment_gap_cv ?? -1,
      filler_ratio: w.filler_ratio,
      word_count: w.word_count,
      segment_count: w.segment_count,
      energy_autocorr_lag1: energyAutocorrLag1 ?? -1,
      energy_autocorr_lag3: energyAutocorrLag3 ?? -1,
      pitch_variance: typeof rhythm?.pitch_variance === 'number' ? rhythm.pitch_variance : -1,
      pause_entropy: typeof rhythm?.pause_entropy === 'number' ? rhythm.pause_entropy : -1,
      rules_hit: rulesHit,
      would_flag: wouldFlag,
    },
    _mode: mode,
    _scorer_version: ROBOTIC_VOICE_SCORER_VERSION,
  }
}
