/**
 * Robotic / TTS voice detector (Google Translate speak, AI voice playback).
 * Phase 0: log-only — scores are stored in result_json; blocking requires ROBOTIC_VOICE_MODE=block.
 */

export interface BrowserRhythmInput {
  speech_rate?: number
  pause_variance?: number
  pause_entropy?: number
  pitch_variance?: number
  energy_variance?: number
  voiced_ratio?: number
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
  signals: Record<string, number | boolean | string[]>
  _mode: 'log' | 'block'
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

  return {
    word_count: wordCount,
    filler_ratio: wordCount > 0 ? fillerCount / wordCount : 0,
    segment_duration_cv: coefficientOfVariation(durations),
    inter_segment_gap_cv: coefficientOfVariation(gaps),
    mean_logprob: meanLogprob,
    segment_count: segments.length,
  }
}

function getMode(): 'log' | 'block' {
  return process.env.ROBOTIC_VOICE_MODE === 'block' ? 'block' : 'log'
}

/**
 * Score 0 = likely human mic, 100 = likely TTS / playback.
 * flagged is true when score >= 75 and at least 2 rule buckets fire (block only when mode=block).
 */
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
  const whisperStats = whisperDerived(input.whisper_verbose)

  const pitchVariance =
    typeof rhythm?.pitch_variance === 'number' && Number.isFinite(rhythm.pitch_variance)
      ? rhythm.pitch_variance
      : null
  const pauseEntropy =
    typeof rhythm?.pause_entropy === 'number' && Number.isFinite(rhythm.pause_entropy)
      ? rhythm.pause_entropy
      : null
  const pauseVariance =
    typeof rhythm?.pause_variance === 'number' && Number.isFinite(rhythm.pause_variance)
      ? rhythm.pause_variance
      : null
  const energyVariance =
    typeof rhythm?.energy_variance === 'number' && Number.isFinite(rhythm.energy_variance)
      ? rhythm.energy_variance
      : null

  const rulesHit: string[] = []
  let score = 0

  if (pitchVariance != null && pitchVariance < 8) {
    score += 25
    rulesHit.push('flat_pitch')
  }
  if (pauseEntropy != null && pauseEntropy < 1.2) {
    score += 25
    rulesHit.push('low_pause_entropy')
  }
  if (
    whisperStats.segment_duration_cv != null &&
    whisperStats.segment_duration_cv < 0.15 &&
    whisperStats.segment_count >= 3
  ) {
    score += 20
    rulesHit.push('uniform_segments')
  }
  if (
    whisperStats.mean_logprob != null &&
    whisperStats.mean_logprob > -0.25 &&
    whisperStats.word_count >= MIN_WORDS_FOR_STRICT_RULES
  ) {
    score += 15
    rulesHit.push('high_asr_confidence')
  }
  if (
    whisperStats.filler_ratio === 0 &&
    whisperStats.word_count >= MIN_WORDS_FOR_STRICT_RULES &&
    pitchVariance != null &&
    pitchVariance < 12 &&
    pauseEntropy != null &&
    pauseEntropy < 1.5
  ) {
    score += 15
    rulesHit.push('zero_fillers_flat_rhythm')
  }
  if (pauseVariance != null && pauseVariance < 0.02 && pauseEntropy != null && pauseEntropy < 1.0) {
    score += 10
    rulesHit.push('mechanical_pauses')
  }
  if (energyVariance != null && energyVariance < 0.0005 && pitchVariance != null && pitchVariance < 10) {
    score += 10
    rulesHit.push('flat_energy')
  }

  score = Math.min(100, score)

  const bucketCount = new Set(
    rulesHit.map((r) => {
      if (r === 'flat_pitch' || r === 'flat_energy') return 'pitch_energy'
      if (r === 'low_pause_entropy' || r === 'mechanical_pauses') return 'pauses'
      if (r === 'uniform_segments' || r === 'high_asr_confidence') return 'whisper'
      return r
    })
  ).size

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
      pitch_variance: pitchVariance ?? -1,
      pause_entropy: pauseEntropy ?? -1,
      pause_variance: pauseVariance ?? -1,
      energy_variance: energyVariance ?? -1,
      segment_duration_cv: whisperStats.segment_duration_cv ?? -1,
      inter_segment_gap_cv: whisperStats.inter_segment_gap_cv ?? -1,
      mean_logprob: whisperStats.mean_logprob ?? -99,
      filler_ratio: whisperStats.filler_ratio,
      word_count: whisperStats.word_count,
      rules_hit: rulesHit,
      would_flag: wouldFlag,
    },
    _mode: mode,
  }
}
