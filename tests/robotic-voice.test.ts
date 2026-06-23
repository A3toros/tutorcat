import { computeRoboticVoiceScore } from '../functions/robotic-voice'

function seg(
  i: number,
  text: string,
  start: number,
  end: number,
  avg_logprob: number
) {
  return { start, end, text, avg_logprob }
}

function flatSegments(
  count: number,
  logprob: number,
  wordPerSeg = 4
): ReturnType<typeof seg>[] {
  const out = []
  let t = 0
  for (let i = 0; i < count; i++) {
    const words = Array.from({ length: wordPerSeg }, (_, j) => `w${i * wordPerSeg + j}`).join(' ')
    out.push(seg(i, words + '.', t, t + 2, logprob))
    t += 2.2
  }
  return out
}

function variableLogprobSegments(count: number): ReturnType<typeof seg>[] {
  const probs = [-0.55, -0.35, -0.48, -0.3, -0.52, -0.38]
  const out = []
  let t = 0
  for (let i = 0; i < count; i++) {
    const words = `word${i} word${i}b word${i}c word${i}d.`
    out.push(seg(i, words, t, t + 2, probs[i % probs.length]))
    t += 2.3
  }
  return out
}

describe('robotic-voice v2.3.4', () => {
  describe('v2.3.4 human FP regressions (2026-06-18)', () => {
    it('does not flag Ploy 52467 personality card (3 seg, mean -0.359, flat pitch)', () => {
      const text =
        'I am a friendly person and I like to help my friends when they need something.'
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [
            seg(0, 'I am a friendly person and I like to help my friends', 0, 4, -0.359),
            seg(1, 'when they need something.', 4, 6, -0.359),
            seg(2, '', 6, 6.1, -0.359),
          ].filter((s) => s.text),
        },
        browser_rhythm: { pitch_variance: 0.0011, energy_autocorr_lag1: 0.12 },
      })
      expect(r.score).toBeLessThan(70)
      expect(r.signals.would_flag).toBe(false)
      expect(r.signals.rules_hit).not.toContain('low_pitch_tts')
    })

    it('does not flag 51731 parents/work 2-seg (mean -0.449, rhythm-only v2.3.3 FP)', () => {
      const text =
        'My parents work in a hospital and they help sick people every day.'
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [
            seg(0, 'My parents work in a hospital and they help sick people', 0, 5, -0.449),
            seg(1, 'every day.', 5, 6, -0.449),
          ],
        },
        browser_rhythm: { pitch_variance: 0.0008, energy_autocorr_lag1: 0.15 },
      })
      expect(r.score).toBeLessThan(70)
      expect(r.signals.would_flag).toBe(false)
      expect(r.signals.score_skip_reason).toBe('artifact_short_no_corroboration')
    })

    it('still flags admin GTTS party 3-seg (mean -0.42) via hard-ASR rhythm path', () => {
      const segments = flatSegments(3, -0.42, 6)
      const text = segments.map((s) => s.text).join(' ')
      const r = computeRoboticVoiceScore({
        whisper_verbose: { text, segments, duration: 8 },
        browser_rhythm: { pitch_variance: 0.00044, energy_autocorr_lag1: 0.09 },
      })
      expect(r.score).toBeGreaterThanOrEqual(70)
      expect(r.signals.would_flag).toBe(true)
      expect(r.signals.rules_hit).toContain('tts_flat_logprob_short')
    })
  })

  describe('admin ChatGPT TTS calibration samples (2026-06-17)', () => {
    it('single-segment mall shopping prompt (b7232152 pattern)', () => {
      const text =
        "I usually go shopping at the shopping mall because it has a lot of different stores with a broad choice of products."
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [seg(0, text, 0, 12, -0.306505024433136)],
        },
        browser_rhythm: { pitch_variance: 0.000795584381540993, energy_autocorr_lag1: 0.18 },
      })
      expect(r.score).toBeGreaterThanOrEqual(70)
      expect(r.signals.would_flag).toBe(true)
      expect(r.signals.rules_hit).toContain('tts_easy_single_segment')
    })

    it('single-segment online shopping prompt with "like" is not a filler', () => {
      const text =
        "I like shopping online because it's very convenient and I can read the reviews from other buyers which helps when I'm in doubt."
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [seg(0, text, 0, 14, -0.2923049032688141)],
        },
        browser_rhythm: { pitch_variance: 0.0005227293522712682, energy_autocorr_lag1: 0.23 },
      })
      expect(r.signals.filler_count).toBe(0)
      expect(r.score).toBeGreaterThanOrEqual(70)
      expect(r.signals.rules_hit).toEqual(
        expect.arrayContaining(['tts_easy_single_segment', 'filler_absence', 'low_pitch_tts'])
      )
    })

    it('2-segment worth-the-price prompt (594cb450 pattern)', () => {
      const text =
        "I think that the good product doesn't have to be expensive, but it has to be reliable. Something from a brand that existed for some time and got a reputation."
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [
            seg(0, "I think that the good product doesn't have to be expensive, but it has to be reliable.", 0, 6, -0.3279002606868744),
            seg(1, 'Something from a brand that existed for some time and got a reputation.', 6, 12, -0.3279002606868744),
          ],
        },
        browser_rhythm: { pitch_variance: 0.0003762488534464638, energy_autocorr_lag1: 0.09 },
      })
      expect(r.score).toBeGreaterThanOrEqual(70)
      expect(r.signals.would_flag).toBe(true)
      expect(r.signals.rules_hit).toContain('tts_flat_logprob_short')
    })
  })

  it('scores 0 for short human-like artifact (3 segments) without TTS rhythm — v2 FP pattern', () => {
    const segments = flatSegments(3, -0.32)
    const text = segments.map((s) => s.text).join(' ')
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text, segments, duration: 8 },
      browser_rhythm: { pitch_variance: 0.05, energy_autocorr_lag1: 0.6 },
    })
    expect(r.score).toBe(0)
    expect(r.signals.score_skip_reason).toBe('artifact_short_no_corroboration')
    expect(r.signals.would_flag).toBe(false)
  })

  it('scores short AI-voice TTS (3 segments) with low pitch corroboration', () => {
    const segments = flatSegments(3, -0.28, 6)
    const text = segments.map((s) => s.text).join(' ')
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text, segments, duration: 8 },
      browser_rhythm: { pitch_variance: 0.012, energy_autocorr_lag1: 0.55 },
    })
    expect(r.score).toBeGreaterThanOrEqual(45)
    expect(r.signals.rules_hit).toContain('tts_flat_logprob_short')
    expect(r.signals.rhythm_corroborated).toBe(true)
  })

  it('scores single-segment ChatGPT TTS with easy ASR', () => {
    const text =
      'I usually go shopping at the mall near my house because it has many stores.'
    const r = computeRoboticVoiceScore({
      whisper_verbose: {
        text,
        segments: [seg(0, text, 0, 9, -0.22)],
        duration: 9,
      },
      browser_rhythm: { pitch_variance: 0.01, energy_autocorr_lag1: 0.55 },
    })
    expect(r.score).toBeGreaterThanOrEqual(48)
    expect(r.signals.rules_hit).toContain('tts_easy_single_segment')
    expect(r.signals.segment_count).toBe(1)
  })

  it('2-segment short TTS can reach would-flag with boundary pauses', () => {
    const segments = flatSegments(2, -0.26, 8)
    const text = segments.map((s) => s.text).join(' ')
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text, segments, duration: 6 },
      browser_rhythm: { pitch_variance: 0.01, energy_autocorr_lag1: 0.55 },
    })
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.signals.would_flag).toBe(true)
    expect(r.signals.rules_hit).toEqual(
      expect.arrayContaining(['tts_flat_logprob_short', 'high_boundary_pauses'])
    )
  })

  it('scores short TTS via very-easy ASR when rhythm missing', () => {
    const segments = flatSegments(4, -0.22, 5)
    const text = segments.map((s) => s.text).join(' ')
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text, segments, duration: 10 },
    })
    expect(r.score).toBeGreaterThanOrEqual(45)
    expect(r.signals.very_easy_asr).toBe(true)
    expect(r.signals.rules_hit).toContain('tts_flat_logprob_short')
  })

  it('scores ≥55 for Google Translate-like flat logprob TTS (6 segments)', () => {
    const segments = flatSegments(6, -0.28)
    const text = segments.map((s) => s.text).join(' ')
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text, segments, duration: 14 },
      browser_rhythm: { pitch_variance: 0.01, energy_autocorr_lag1: 0.72 },
    })
    expect(r.score).toBeGreaterThanOrEqual(55)
    expect(r.signals.rules_hit).toContain('tts_flat_logprob')
    expect(r.signals.has_strong_artifact_tts).toBe(true)
  })

  it('would-flag strong TTS with corroboration (boundary + no fillers)', () => {
    const segments = flatSegments(7, -0.25, 5)
    const text = segments.map((s) => s.text).join(' ')
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text, segments, duration: 18 },
      browser_rhythm: { pitch_variance: 0.008, energy_autocorr_lag1: 0.68 },
    })
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.signals.would_flag).toBe(true)
    expect(r.signals.rules_hit).toEqual(
      expect.arrayContaining(['tts_flat_logprob', 'high_boundary_pauses', 'filler_absence'])
    )
  })

  it('keeps variable-logprob human speech below 40', () => {
    const segments = variableLogprobSegments(6)
    const text = segments.map((s) => s.text).join(' ')
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text, segments, duration: 14 },
      browser_rhythm: { pitch_variance: 0.06, energy_autocorr_lag1: 0.55 },
    })
    expect(r.score).toBeLessThan(40)
    expect(r.signals.logprob_is_artifact).toBe(false)
  })

  it('never would-flags improvement read-aloud', () => {
    const segments = flatSegments(8, -0.2)
    const text = segments.map((s) => s.text).join(' ')
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text, segments, duration: 20 },
      prompt_id: 'improvement',
    })
    expect(r.score).toBeGreaterThanOrEqual(55)
    expect(r.signals.would_flag).toBe(false)
    expect(r.signals.skip_would_flag_improvement).toBe(true)
  })

  it('reports scorer version v2.3.4', () => {
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text: 'hello', segments: [seg(0, 'hello.', 0, 1, -0.3)] },
    })
    expect(r.signals.scorer_version).toBe('v2.3.4')
  })
})
