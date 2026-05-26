/** Speech-job + analysis-result flow — same backend as SpeakingWithFeedback. */

export const SPEECH_MAX_DURATION_SECONDS = 120
export const SPEECH_MAX_AUDIO_BYTES = 20 * 1024 * 1024
export const DELIVERY_SPOKEN_PCT_MIN = 70

const POLL_INTERVAL_MS = 2000
const POLL_INTERVAL_BACKGROUND_MS = 4000
const POLL_JITTER_MS = 500

export interface SpeechFeedbackPayload {
  transcript: string
  overall_score: number
  feedback: string
  grammar_corrections?: Array<{ mistake: string; correction: string }>
  vocabulary_corrections?: Array<{ mistake: string; correction: string }>
  is_off_topic?: boolean
  integrity?: unknown
}

export type SpeechErrorFlags = {
  isMinWordsError?: boolean
  isAIFlaggedError?: boolean
  isSpeechTooLongError?: boolean
  isQuestionRepetitionError?: boolean
  isConsecutiveRepetitionError?: boolean
  isDeliveryReadError?: boolean
}

export function getMinWordsForLevel(level?: string | null): number {
  const l = (level || '').toUpperCase().trim()
  if (l === 'A1' || l === 'A2') return 20
  if (l === 'B1' || l === 'B2') return 40
  if (l === 'C1' || l === 'C2') return 60
  return 20
}

export function triggerSpeechAnalysisBackground(jobId: string): void {
  fetch('/.netlify/functions/run-speech-analysis-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  }).catch(() => {})
}

function getPollDelayMs(): number {
  const base =
    typeof document !== 'undefined' && document.visibilityState === 'visible'
      ? POLL_INTERVAL_MS
      : POLL_INTERVAL_BACKGROUND_MS
  return base + Math.floor(Math.random() * (POLL_JITTER_MS + 1))
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function fetchJson(url: string, options?: RequestInit): Promise<{ res: Response; data: Record<string, unknown> }> {
  const res = await fetch(url, options)
  const text = await res.text()
  if (text.trimStart().startsWith('<')) {
    throw speechError(
      'Speech API returned HTML. Run with Netlify functions (npm run dev:netlify).',
      {}
    )
  }
  let data: Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw speechError('Invalid response from speech API.', {})
  }
  return { res, data }
}

function speechError(message: string, flags: SpeechErrorFlags): Error & SpeechErrorFlags {
  return Object.assign(new Error(message), flags)
}

export function getSupportedRecordingMimeType(): string {
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isIOS) {
    const iosTypes = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2']
    const supported = iosTypes.find((t) => MediaRecorder.isTypeSupported(t))
    if (supported) return supported
    throw new Error('MediaRecorder is not supported on this device.')
  }

  const preferred = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ]
  const supported = preferred.find((t) => MediaRecorder.isTypeSupported(t))
  if (!supported) throw new Error('No supported audio format found.')
  return supported
}

export async function submitSpeechForFeedback(params: {
  audioBlob: Blob
  recordingDurationSec: number
  prompt: string
  promptId: string
  lessonId: string
  userId?: string
  minWords?: number
  cefrLevel?: string
  onPollStatus?: (status: 'processing' | 'analyzing') => void
}): Promise<SpeechFeedbackPayload> {
  const {
    audioBlob,
    recordingDurationSec,
    prompt,
    promptId,
    lessonId,
    userId,
    minWords,
    cefrLevel,
    onPollStatus,
  } = params

  const effectiveMinWords = minWords ?? getMinWordsForLevel(cefrLevel)

  if (!audioBlob || audioBlob.size < 1000) {
    throw speechError('Audio recording is too short. Please record again.', {})
  }
  if (recordingDurationSec > SPEECH_MAX_DURATION_SECONDS || audioBlob.size > SPEECH_MAX_AUDIO_BYTES) {
    throw speechError('Please speak for less than 2 minutes.', { isSpeechTooLongError: true })
  }

  const base64Audio = await blobToBase64(audioBlob)

  const { res: speechJobRes, data: errBody } = await fetchJson('/.netlify/functions/speech-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_blob: base64Audio,
      audio_mime_type: audioBlob.type || 'audio/webm',
      prompt,
      prompt_id: promptId,
      cefr_level: cefrLevel?.trim() || undefined,
      min_words: effectiveMinWords,
      duration_seconds: Math.max(1, Math.round(recordingDurationSec)),
      user_id: userId || undefined,
      lesson_id: lessonId,
    }),
  })

  if (!speechJobRes.ok) {
    const code = errBody?.code as string | undefined
    if (speechJobRes.status === 413 || code === 'audio_too_large' || code === 'duration_too_long') {
      throw speechError(String(errBody?.error || 'Please speak for less than 2 minutes.'), {
        isSpeechTooLongError: true,
      })
    }
    throw speechError(String(errBody?.error || `Request failed: ${speechJobRes.status}`), {})
  }

  const jobId = errBody.jobId as string | undefined
  if (!jobId) throw speechError('No job ID returned from server.', {})

  triggerSpeechAnalysisBackground(jobId)

  const pollResult = async () => {
    const { res, data } = await fetchJson(
      `/.netlify/functions/analysis-result?id=${encodeURIComponent(jobId)}`,
      { cache: 'no-store' }
    )
    if (!res.ok) throw speechError(`Poll failed: ${res.status}`, {})
    return data as {
      status: string
      result?: Record<string, unknown>
      error?: string
      transcript?: string
    }
  }

  let data = await pollResult()
  while (data.status === 'processing' || data.status === 'analyzing') {
    onPollStatus?.(data.status === 'analyzing' ? 'analyzing' : 'processing')
    await new Promise((r) => setTimeout(r, getPollDelayMs()))
    data = await pollResult()
  }

  const result = (data.result || {}) as Record<string, unknown>
  const transcript = String(data.transcript ?? result.transcript ?? '')

  if (data.status === 'failed') {
    if (result.reason === 'question_repetition') {
      throw speechError(
        String(data.error || 'It sounds like you repeated the question. Please answer in your own words.'),
        { isQuestionRepetitionError: true }
      )
    }
    if (result.reason === 'consecutive_repetition') {
      throw speechError(
        String(
          data.error ||
            "Don't repeat the same word or phrase to make your answer longer. Say your answer in your own words, then record again."
        ),
        { isConsecutiveRepetitionError: true }
      )
    }
    if (result.min_words != null && result.word_count != null) {
      throw speechError(
        String(
          result.error ||
            `Please speak at least ${result.min_words} words. You said ${result.word_count} word(s).`
        ),
        { isMinWordsError: true }
      )
    }
    throw speechError(String(data.error || 'Analysis failed.'), {})
  }

  if (
    result.min_words != null &&
    result.word_count != null &&
    (result.word_count as number) < (result.min_words as number)
  ) {
    throw speechError(
      String(
        result.error ||
          `Please speak at least ${result.min_words} words. You said ${result.word_count} word(s).`
      ),
      { isMinWordsError: true }
    )
  }

  const errorStr = typeof result.error === 'string' ? result.error : ''
  if (
    result.error_code === 'speech_too_long' ||
    errorStr.includes('2 minute') ||
    errorStr.includes('20 MB')
  ) {
    throw speechError(errorStr || 'Please speak for less than 2 minutes.', {
      isSpeechTooLongError: true,
    })
  }

  const flagged =
    (result?.integrity as { flagged?: boolean } | undefined)?.flagged === true ||
    result?.ai_flagged === true ||
    result?.flagged === true
  if (flagged) {
    throw speechError(
      String(
        (result?.integrity as { message?: string } | undefined)?.message ||
          result?.message ||
          'Your answer was flagged. Please try again using your own words.'
      ),
      { isAIFlaggedError: true }
    )
  }

  const feedbackObj =
    result.feedback && typeof result.feedback === 'object' && !Array.isArray(result.feedback)
      ? (result.feedback as Record<string, unknown>)
      : null
  const delivery = (result?.delivery ?? feedbackObj?.delivery) as { spoken_pct?: number } | undefined
  const spokenPct = typeof delivery?.spoken_pct === 'number' ? delivery.spoken_pct : 100
  if (spokenPct < DELIVERY_SPOKEN_PCT_MIN) {
    throw speechError('Please speak in your own words instead of reading. Re-record your answer.', {
      isDeliveryReadError: true,
    })
  }

  if (typeof result.overall_score !== 'number') {
    throw speechError('Something went wrong. Please try again.', {})
  }

  const feedbackText =
    typeof result.feedback === 'string'
      ? result.feedback
      : typeof feedbackObj?.summary === 'string'
        ? feedbackObj.summary
        : ''

  return {
    transcript,
    overall_score: result.overall_score,
    feedback: feedbackText,
    grammar_corrections: (result.grammar_corrections as SpeechFeedbackPayload['grammar_corrections']) || [],
    vocabulary_corrections:
      (result.vocabulary_corrections as SpeechFeedbackPayload['vocabulary_corrections']) || [],
    is_off_topic: Boolean(result.is_off_topic),
    integrity: result.integrity,
  }
}
