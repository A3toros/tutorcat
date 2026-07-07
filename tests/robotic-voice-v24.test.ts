import { computeRoboticVoiceScore } from '../functions/robotic-voice'
import { resolveTaskContext, tokenOverlapRatio } from '../functions/lib/robotic-voice-task'

function seg(
  i: number,
  text: string,
  start: number,
  end: number,
  avg_logprob: number,
  no_speech_prob?: number,
  words?: Array<{ word: string; start: number; end: number; probability: number }>
) {
  const base = { id: i, start, end, text, avg_logprob, no_speech_prob }
  return words ? { ...base, words } : base
}

function easyWords(text: string, prob = 0.94): Array<{ word: string; start: number; end: number; probability: number }> {
  const tokens = text.split(/\s+/).filter(Boolean)
  return tokens.map((word, i) => ({
    word,
    start: i * 0.35,
    end: (i + 1) * 0.35,
    probability: prob,
  }))
}

describe('robotic-voice v2.4.0', () => {
  it('reports scorer version v2.4.0', () => {
    const r = computeRoboticVoiceScore({
      whisper_verbose: { text: 'hello world here now ok', segments: [seg(0, 'hello world here now ok.', 0, 3, -0.3)] },
    })
    expect(r.signals.scorer_version).toBe('v2.4.0')
  })

  it('uses short_clip_path when word probs exist and answer is brief', () => {
    const text = 'I think my hero is very brave and kind to everyone always.'
    const r = computeRoboticVoiceScore({
      whisper_verbose: {
        text,
        segments: [seg(0, text, 0, 5, -0.31, 0.05, easyWords(text))],
      },
      browser_rhythm: { pitch_variance: 0.001, energy_autocorr_lag1: 0.72 },
      activity_type: 'speaking_with_feedback',
      prompt_text: 'Who is your hero?',
    })
    expect(r.signals.short_clip_path).toBe(true)
    expect(r.signals.task_expectation).toBe('spontaneous')
  })

  it('flags short-clip TTS via word_easy_asr + rhythm', () => {
    const text =
      'My hero is very strong and kind one day a villain tried to rob a bank downtown.'
    const r = computeRoboticVoiceScore({
      whisper_verbose: {
        text,
        segments: [seg(0, text, 0, 8, -0.29, 0.06, easyWords(text, 0.96))],
      },
      browser_rhythm: { pitch_variance: 0.001, energy_autocorr_lag1: 0.75 },
      activity_type: 'speaking_with_feedback',
      prompt_text: 'Tell me about your hero.',
    })
    expect(r.signals.rules_hit).toEqual(expect.arrayContaining(['word_easy_asr']))
    expect(r.signals.would_flag).toBe(true)
    expect(r.signals.delivery_mode).toBe('tts')
  })

  it('suppresses short-clip TTS when fillers present on spontaneous task', () => {
    const text = 'Um I think my hero is um very brave and kind to people.'
    const r = computeRoboticVoiceScore({
      whisper_verbose: {
        text,
        segments: [seg(0, text, 0, 6, -0.29, 0.05, easyWords(text, 0.95))],
      },
      browser_rhythm: { pitch_variance: 0.001, energy_autocorr_lag1: 0.72 },
      activity_type: 'speaking_with_feedback',
      prompt_text: 'Who is your hero?',
    })
    expect(r.signals.has_spontaneous_human_cues).toBe(true)
    expect(r.signals.would_flag).toBe(false)
  })

  it('marks task-inappropriate reading when student repeats the question', () => {
    const prompt = 'My hero versus a villain who would win and why'
    const text =
      'My hero versus a villain who would win and why because my hero is stronger.'
    const overlap = tokenOverlapRatio(text, prompt)
    expect(overlap).toBeGreaterThan(0.55)

    const r = computeRoboticVoiceScore({
      whisper_verbose: {
        text,
        segments: [seg(0, text, 0, 7, -0.38, 0.01)],
      },
      activity_type: 'speaking_with_feedback',
      prompt_text: prompt,
    })
    expect(r.signals.task_inappropriate_reading).toBe(true)
    expect(r.signals.delivery_mode).toBe('reading')
    expect(r.signals.would_flag).toBe(false)
    expect(r.signals.score_skip_reason).toBe('task_inappropriate_reading_skip')
  })

  it('improvement activity is reading-expected and never would-flags', () => {
    const text = 'She was brave hardworking and kind she never gave up.'
    const r = computeRoboticVoiceScore({
      whisper_verbose: {
        text,
        segments: [seg(0, text, 0, 6, -0.29, 0.05, easyWords(text, 0.97))],
      },
      browser_rhythm: { pitch_variance: 0.001, energy_autocorr_lag1: 0.8 },
      prompt_id: 'improvement',
      activity_type: 'speaking_improvement',
      reference_text: text,
    })
    expect(r.signals.task_expectation).toBe('reading')
    expect(r.signals.delivery_mode).toBe('reading')
    expect(r.signals.would_flag).toBe(false)
    expect(r.signals.skip_would_flag_task_reading).toBe(true)
  })
})

describe('robotic-voice-task', () => {
  it('resolves improvement as reading expected', () => {
    const t = resolveTaskContext({ prompt_id: 'improvement' }, 'hello world')
    expect(t.expectation).toBe('reading')
    expect(t.skip_tts_would_flag).toBe(true)
  })

  it('resolves speaking_with_feedback as spontaneous', () => {
    const t = resolveTaskContext({ activity_type: 'speaking_with_feedback' }, 'hello')
    expect(t.expectation).toBe('spontaneous')
  })
})
