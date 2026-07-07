/**
 * Word-level Whisper confidence features for short-utterance scoring (v2.4+).
 */

export interface WhisperWordToken {
  word?: string
  start?: number
  end?: number
  probability?: number
}

export interface WhisperVerboseWordsInput {
  segments?: Array<{
    words?: WhisperWordToken[]
    avg_logprob?: number
  }>
  words?: WhisperWordToken[]
}

export interface WordAsrStats {
  word_prob_count: number
  mean_word_prob: number | null
  min_word_prob: number | null
  /** True when word-level probs unavailable — use segment logprob fallback */
  uses_segment_fallback: boolean
}

export function collectWhisperWords(whisper: WhisperVerboseWordsInput | null | undefined): WhisperWordToken[] {
  if (!whisper || typeof whisper !== 'object') return []

  const topLevel = whisper.words
  if (Array.isArray(topLevel) && topLevel.length > 0) {
    return topLevel
  }

  const segments = Array.isArray(whisper.segments) ? whisper.segments : []
  const out: WhisperWordToken[] = []
  for (const seg of segments) {
    if (!Array.isArray(seg.words)) continue
    for (const w of seg.words) {
      if (w && typeof w === 'object') out.push(w)
    }
  }
  return out
}

export function computeWordAsrStats(whisper: WhisperVerboseWordsInput | null | undefined): WordAsrStats {
  const words = collectWhisperWords(whisper)
  const probs: number[] = []
  for (const w of words) {
    const p = Number(w.probability)
    if (Number.isFinite(p) && p >= 0 && p <= 1) probs.push(p)
  }

  if (probs.length >= 3) {
    const mean = probs.reduce((a, b) => a + b, 0) / probs.length
    return {
      word_prob_count: probs.length,
      mean_word_prob: mean,
      min_word_prob: Math.min(...probs),
      uses_segment_fallback: false,
    }
  }

  return {
    word_prob_count: probs.length,
    mean_word_prob: probs.length > 0 ? probs.reduce((a, b) => a + b, 0) / probs.length : null,
    min_word_prob: probs.length > 0 ? Math.min(...probs) : null,
    uses_segment_fallback: true,
  }
}

/** TTS / very clean ASR — stable on short clips when word probs exist. */
export function isVeryEasyWordAsr(stats: WordAsrStats): boolean {
  if (stats.uses_segment_fallback || stats.mean_word_prob == null || stats.min_word_prob == null) {
    return false
  }
  return stats.mean_word_prob >= 0.88 && stats.min_word_prob >= 0.62
}

/** Segment logprob fallback when Whisper word probs missing (legacy jobs). */
export function isVeryEasySegmentLogprobFallback(meanLogprob: number | null, minLogprob: number | null): boolean {
  if (meanLogprob == null || minLogprob == null) return false
  return meanLogprob > -0.34 && minLogprob > -0.4
}
