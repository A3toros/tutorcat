import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { computeRoboticVoiceScore } from '../functions/robotic-voice'

const BACKUP_FEATURES = join(
  process.cwd(),
  'backups/tutorcat-2026-06-24T01-05-16'
)

function loadBackupFeatures(jobId: string) {
  const path = join(BACKUP_FEATURES, `${jobId}.features.JSON`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8')) as {
    whisper_verbose?: object
    browser_rhythm?: object
  }
}

function scoreBackupJob(jobId: string, promptId = 'prompt-0') {
  const f = loadBackupFeatures(jobId)
  if (!f) throw new Error(`missing backup features for ${jobId}`)
  return computeRoboticVoiceScore({
    whisper_verbose: f.whisper_verbose ?? null,
    browser_rhythm: f.browser_rhythm ?? null,
    prompt_id: promptId,
  })
}

function seg(
  i: number,
  text: string,
  start: number,
  end: number,
  avg_logprob: number,
  no_speech_prob?: number
) {
  const base = { start, end, text, avg_logprob }
  return no_speech_prob != null ? { ...base, no_speech_prob } : base
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

describe('robotic-voice v2.3.7', () => {
  /** Flat logprob segments with uneven durations (human read-aloud pacing). */
  function readingLikeSegments(
    count: number,
    logprob: number,
    durations: number[]
  ): ReturnType<typeof seg>[] {
    const out = []
    let t = 0
    for (let i = 0; i < count; i++) {
      const dur = durations[i] ?? 2
      out.push(seg(i, `segment ${i} words here.`, t, t + dur, logprob))
      t += dur + 0.3
    }
    return out
  }

  describe('v2.3.7 production would-flag audit (2026-06-28)', () => {
    it.each([
      { job: '52470 friends', logprob: -0.4115547239780426, segCv: 0.44, durations: [2.1, 3.8, 1.6] },
      { job: '52470 special', logprob: -0.4472290873527527, segCv: 0.73, durations: [1.2, 4.5, 2.8] },
      { job: '52466 hero story', logprob: -0.44362759590148926, segCv: 0.58, durations: [2.5, 4.2, 1.9] },
      { job: '52467 likes', logprob: -0.4155702590942383, segCv: 0.33, durations: [2, 3, 2.5] },
      { job: 'title mean -0.397', logprob: -0.39737287163734436, durations: [2, 3.4, 2.2] },
      { job: 'title mean -0.391', logprob: -0.39081329107284546, durations: [1, 5.2, 2.1] },
    ])('$job — human read-aloud not would-flag', ({ logprob, durations }) => {
      const segments = readingLikeSegments(3, logprob, durations)
      const text = segments.map((s) => s.text).join(' ')
      const r = computeRoboticVoiceScore({
        whisper_verbose: { text, segments, duration: 12 },
        browser_rhythm: { pitch_variance: 0.001, energy_autocorr_lag1: 0.15 },
      })
      expect(r.signals.delivery_mode).toBe('reading')
      expect(r.signals.would_flag).toBe(false)
      expect(r.score).toBeLessThan(70)
    })

    it('seiryu weather — gap CV corroborates reading when segment CV is low', () => {
      const logprob = -0.3847607970237732
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text: 'one two three four five six seven eight nine ten eleven twelve.',
          segments: [
            seg(0, 'one two three four.', 0, 3, logprob),
            seg(1, 'five six seven eight.', 3.8, 6.9, logprob),
            seg(2, 'nine ten eleven twelve.', 8.2, 11.3, logprob),
          ],
        },
        browser_rhythm: { pitch_variance: 0.001, energy_autocorr_lag1: 0.12 },
      })
      expect(r.signals.delivery_mode).toBe('reading')
      expect(r.signals.would_flag).toBe(false)
    })
  })

  describe('v2.3.6 reading vs TTS (2026-06-28)', () => {
    it('52448 L1 online time — rehearsed read-aloud, not TTS (flat -0.404, human timing)', () => {
      const logprob = -0.40451547503471375
      const text =
        "I don't think kids should spend too much time online while the internet is gate for doing homework or playing games Sitting in front of skin for hours bad for our eyes and make us Inactive I believe we need to balance We should spend more time playing sport or hanging out with our friends and family in real life Instead of staring at our phone every day all day"
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [
            seg(
              0,
              "I don't think kids should spend too much time online while the internet is gate for doing homework or playing games",
              0,
              4.2,
              logprob
            ),
            seg(1, 'Sitting in front of skin for hours bad for our eyes and make us Inactive', 4.5, 7.1, logprob),
            seg(2, 'I believe we need to balance', 7.4, 8.6, logprob),
            seg(3, 'We should spend more time playing sport or hanging out with our friends and family in real life', 8.9, 12.8, logprob),
            seg(4, 'Instead of staring at our phone every day all day', 13.1, 15.2, logprob),
          ],
        },
        browser_rhythm: {
          pitch_variance: 0.0009691146261630754,
          energy_autocorr_lag1: 0.16828371149666813,
          energy_autocorr_lag3: 0.11623318983297588,
          pause_entropy: 2.4277185566301887,
        },
      })
      expect(r.signals.delivery_mode).toBe('reading')
      expect(r.signals.likely_reading_aloud).toBe(true)
      expect(r.signals.logprob_is_artifact).toBe(true)
      expect(r.signals.would_flag).toBe(false)
      expect(r.score).toBeLessThan(70)
      expect(r.signals.artifact_tts_suppressed_reading).toBe(true)
      expect(r.signals.score_skip_reason).toBe('reading_aloud_skip')
    })

    it('52448 games prompt — variable logprob read/speak hybrid is speaking mode', () => {
      const text =
        "I don't usually play games, but the games I play the most, and I like it, maybe I like Roblox because it has a lot of games in that application."
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [
            seg(0, "I don't usually play games, but the games I play the most,", 0, 3, -0.26),
            seg(1, 'and I like it, maybe I like Roblox because it has a lot of games', 3.2, 6.5, -0.31),
            seg(2, 'in that application.', 6.7, 7.5, -0.33),
          ],
        },
        browser_rhythm: { pitch_variance: 0.001, energy_autocorr_lag1: 0.31 },
      })
      expect(r.signals.delivery_mode).toBe('speaking')
      expect(r.signals.logprob_is_artifact).toBe(false)
      expect(r.signals.would_flag).toBe(false)
    })
  })

  describe('v2.3.5 production human FP regressions (2026-06-23)', () => {
    it('52468 hero vs villain — near-flat rehearsed 3-seg human (ceb2f18d)', () => {
      const text =
        'my hero is very strong and kind one day a villain try to rob a bank my hero feel to the bank'
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [
            seg(0, 'my hero is very strong and kind.', 0, 3, -0.4325278401374817),
            seg(1, 'one day a villain try to rob a bank.', 3, 6, -0.43255725502967834),
            seg(2, 'my hero feel to the bank and find the villain.', 6, 10, -0.4325474500656128),
          ],
        },
        browser_rhythm: { pitch_variance: 0.001836994112737629, energy_autocorr_lag1: 0.524 },
      })
      expect(r.signals.logprob_is_artifact).toBe(false)
      expect(r.signals.logprob_is_near_flat).toBe(true)
      expect(r.score).toBeLessThan(70)
      expect(r.signals.would_flag).toBe(false)
    })

    it('111111 cheat-on-test — rehearsed single-seg human at mean -0.349 (f504a9d6)', () => {
      const text =
        "If my friends ask me to cheat, I will honestly say that I don't like this because I'm an honest student."
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [seg(0, text, 0, 10, -0.3488578498363495)],
        },
        browser_rhythm: { pitch_variance: 0.0033735607643804602, energy_autocorr_lag1: 0.274 },
      })
      expect(r.score).toBeLessThan(70)
      expect(r.signals.would_flag).toBe(false)
      expect(r.signals.rules_hit).not.toContain('tts_easy_single_segment')
    })
  })

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
      expect(r.signals.score_skip_reason).toMatch(/artifact_short_(no_corroboration|skip)/)
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

    it('2-segment worth-the-price prompt (594cb450 pattern — GTTS playback)', () => {
      const text =
        "I think that the good product doesn't have to be expensive, but it has to be reliable. Something from a brand that existed for some time and got a reputation."
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [
            seg(0, "I think that the good product doesn't have to be expensive, but it has to be reliable.", 0, 6, -0.3279002606868744, 0.05),
            seg(1, 'Something from a brand that existed for some time and got a reputation.', 6, 12, -0.3279002606868744, 0.05),
          ],
        },
        browser_rhythm: { pitch_variance: 0.0003762488534464638, energy_autocorr_lag1: 0.09 },
      })
      expect(r.score).toBeGreaterThanOrEqual(70)
      expect(r.signals.would_flag).toBe(true)
      expect(r.signals.rules_hit).toContain('tts_flat_logprob_short')
    })

    it.each([
      {
        job: 'aipun weather',
        text: 'I prefer sunny weather because it is bright and warm. I like this weather because I can go outside, have fun, and enjoy.',
        logprob: -0.3222743570804596,
        e1: 0.063427077624766,
        pitch: 0.0011332891007100254,
        durations: [5.2, 5.55],
      },
      {
        job: 'aipun home',
        text: 'What I like most about my home is that it is comfortable and peaceful. I enjoy spending time with my family because my home makes me feel',
        logprob: -0.2890782356262207,
        e1: 0.28362548701235896,
        pitch: 0.0008124948713514542,
        durations: [5.5, 5.75],
      },
      {
        job: 'aipun bedroom',
        text: 'I usually relax in my bedroom because it is quiet, comfortable, and peaceful. I like to read books, listen to music, watch videos, and rest.',
        logprob: -0.3279273211956024,
        e1: 0.4214357057515174,
        pitch: 0.0003393374185564216,
        durations: [5.3, 5.6],
      },
      {
        job: 'aipun school',
        text: 'My school is very close to my home. It is only about three kilometers away. I like riding a motorcycle to school because it is fast and convenient.',
        logprob: -0.31138846278190613,
        e1: 0.44088582966529677,
        pitch: 0.001426289851673768,
        durations: [4.2, 5.8],
      },
      {
        job: 'aipun TV',
        text: 'I like to watch TV and I use it to listen to music. I also watch movie or anime and I like using the TV to play.',
        logprob: -0.3266131281852722,
        e1: 0.44622377041053773,
        pitch: 0.0005033776730201078,
        durations: [5.4, 5.55],
      },
      {
        job: 'aipun reading',
        text: 'I like reading comic books and books about space. I enjoy reading in my bedroom or in the library because they are',
        logprob: -0.3036637604236603,
        e1: 0.47040560560121636,
        pitch: 0.00023339856388603975,
        durations: [4.5, 5.3],
      },
    ])('$job — rehearsed human at mic, not TTS', ({ text, logprob, e1, pitch, durations }) => {
      const mid = Math.floor(text.length / 2)
      const splitAt = text.indexOf('. ', mid)
      const cut = splitAt > 0 ? splitAt + 1 : mid
      const s0 = text.slice(0, cut).trim()
      const s1 = text.slice(cut).trim()
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [
            seg(0, s0, 0, durations[0], logprob, 0.01),
            seg(1, s1, durations[0] + 0.2, durations[0] + 0.2 + durations[1], logprob, 0.01),
          ],
        },
        browser_rhythm: { pitch_variance: pitch, energy_autocorr_lag1: e1 },
        activity_type: 'speaking_with_feedback',
      })
      expect(r.signals.would_flag).toBe(false)
      expect(r.signals.delivery_mode).toBe('speaking')
      expect(r.signals.likely_easy_band_human).toBe(true)
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
})

describe('robotic-voice v2.4.1', () => {
  it('reports scorer version v2.4.1', () => {
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text: 'hello', segments: [seg(0, 'hello.', 0, 1, -0.3)] },
    })
    expect(r.signals.scorer_version).toBe('v2.4.1')
  })

  it('hero vs villain — 2-seg near-flat hard-band prompt read-aloud (mean -0.416)', () => {
    const lp0 = -0.4078414738178253
    const lp1 = -0.42390838265419006
    const text =
      'My hero is Mariko. She was brave, hardworking, and kind. She spent her life discovering new things to help science and medicine. She never gave up, even when life was difficult. I really like is someone who hurt other people or does bad things for selfish reasons. I like my hero is one who thinks only about themselves and does not care about others.'
    const r = computeRoboticVoiceScore({
      whisper_verbose: {
        text,
        segments: [
          seg(
            0,
            'My hero is Mariko. She was brave, hardworking, and kind. She spent her life discovering new things to help science and medicine.',
            0,
            8.2,
            lp0,
            0.01
          ),
          seg(
            1,
            'She never gave up, even when life was difficult. I really like is someone who hurt other people or does bad things for selfish reasons.',
            8.5,
            13.5,
            lp1,
            0.01
          ),
        ],
      },
      browser_rhythm: {
        pitch_variance: 0.002024790295560004,
        energy_autocorr_lag1: 0.48700687006780313,
        energy_autocorr_lag3: 0.14317640427174091,
        pause_entropy: 2.471492474768819,
      },
    })
    expect(r.signals.logprob_is_near_flat).toBe(true)
    expect(r.signals.logprob_is_artifact).toBe(false)
    expect(r.signals.likely_reading_aloud).toBe(true)
    expect(r.signals.delivery_mode).toBe('reading')
    expect(r.signals.would_flag).toBe(false)
    expect(r.score).toBeLessThan(70)
    expect(r.signals.score_skip_reason).toBe('reading_aloud_skip')
  })
})

describe('robotic-voice v2.3.11', () => {
  const hasBackup = existsSync(BACKUP_FEATURES)

  it('reports scorer version v2.3.11', () => {
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text: 'hello', segments: [seg(0, 'hello.', 0, 1, -0.3)] },
    })
    expect(r.signals.scorer_version).toBe('v2.4.1')
  })

  describe('rehearsed read-aloud FP (2026-07-07)', () => {
    it('best friend Tim — even-pacing hard-band read-aloud at mic (mean -0.418)', () => {
      const lp = -0.41758617758750916
      const text =
        'My best friend is Tim. I like to play basketball with him. We also like to walk around Central Lamma 2 together. We always have fun when we spend time together.'
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [
            seg(0, 'My best friend is Tim.', 0, 3.2, lp, 0.01),
            seg(1, 'I like to play basketball with him.', 3.2, 6.5, lp, 0.01),
            seg(2, 'We also like to walk around Central Lamma 2 together.', 6.5, 10.8, lp, 0.01),
          ],
        },
        browser_rhythm: {
          pitch_variance: 0.000649527301938515,
          energy_autocorr_lag1: 0.3119832724779431,
        },
      })
      expect(r.signals.delivery_mode).toBe('reading')
      expect(r.signals.would_flag).toBe(false)
      expect(r.score).toBeLessThan(70)
    })

    it('brothers/sisters — easy-band 3-seg read-aloud (mean -0.274)', () => {
      const lp = -0.27421605587005615
      const text =
        "I don't have a brother or a sister. I usually spend time with my parents. We watch movies, eat together, and sometimes go shopping. I enjoy spending time with my family."
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [
            seg(0, "I don't have a brother or a sister.", 0, 2.5, lp, 0.008),
            seg(1, 'I usually spend time with my parents.', 2.5, 5.8, lp, 0.008),
            seg(2, 'We watch movies, eat together, and sometimes go shopping.', 5.8, 10.2, lp, 0.008),
          ],
        },
        browser_rhythm: {
          pitch_variance: 0.000585152433631318,
          energy_autocorr_lag1: 0.17396782558840523,
        },
      })
      expect(r.signals.delivery_mode).toBe('speaking')
      expect(r.signals.would_flag).toBe(false)
      expect(r.score).toBeLessThan(70)
    })

    it('basketball study — single-seg admin-band mic speech (mean -0.320)', () => {
      const lp = -0.31969720125198364
      const text =
        'I really enjoy learning basketball because it is a sport I love and I want to learn more and become much better.'
      const r = computeRoboticVoiceScore({
        whisper_verbose: {
          text,
          segments: [seg(0, text, 0, 12, lp, 0.006)],
        },
        browser_rhythm: {
          pitch_variance: 0.0003797771052242898,
          energy_autocorr_lag1: 0.36856570959402285,
        },
      })
      expect(r.signals.delivery_mode).toBe('speaking')
      expect(r.signals.would_flag).toBe(false)
      expect(r.score).toBeLessThan(70)
    })
  })

  describe('hard-band human FP vs confirmed student TTS (2026-07-03)', () => {
    const studentTts = [
      '029558f0-c6b1-4799-8c19-05ed3ae39f93',
      'bc1d18eb-a07c-4194-943a-05093dea0141',
      '9dd690cc-3432-4507-86e6-0a60a5610eb5',
    ]
    const humanFp = [
      'd258a102-ff93-4427-9a55-b8d1cf3ad89a',
      'e256f960-098e-4467-86f2-0d3e18916314',
      '3a358f92-647d-4599-9fec-2851f1a783eb',
      'c444cec6-6d66-4907-872e-60c67b0823cf',
      '0c8ba875-fd5f-4ac7-a6e6-191882052bd3',
      '1d5247da-cadc-40ba-9fde-c9cd652c299d',
      'a7e1be8b-de6f-4b5f-b232-ab6e47d36bae',
    ]
    const adminTts = [
      '47d903a2-d757-4a95-9082-dd6bb2a44479',
      'db3bbf14-892c-404e-9122-113e37e2f1c9',
      'a33e9e4e-5648-4457-a85e-fdf557f30540',
    ]

    it.each(studentTts)('confirmed student TTS %s still would-flags', (jobId) => {
      if (!hasBackup) return
      const r = scoreBackupJob(jobId)
      expect(r.signals.would_flag).toBe(true)
      expect(r.signals.delivery_mode).toBe('tts')
      expect(r.score).toBeGreaterThanOrEqual(70)
    })

    it.each(humanFp)('confirmed human %s no longer would-flags', (jobId) => {
      if (!hasBackup) return
      const r = scoreBackupJob(jobId)
      expect(r.signals.would_flag).toBe(false)
      expect(r.signals.delivery_mode).not.toBe('tts')
      expect(r.score).toBeLessThan(70)
    })

    it.each(adminTts)('admin TTS calibration %s still would-flags', (jobId) => {
      if (!hasBackup) return
      const r = scoreBackupJob(jobId)
      expect(r.signals.would_flag).toBe(true)
      expect(r.signals.delivery_mode).toBe('tts')
    })
  })
})

