/** Student classroom speaking — same backend as SpeakingWithFeedback (speech-job + background analysis). */

const POLL_INTERVAL_MS = 2000
const POLL_INTERVAL_BACKGROUND_MS = 4000
const POLL_JITTER_MS = 500

export const STUDENT_MAX_RECORDING_SECONDS = 90
export const STUDENT_MAX_AUDIO_BYTES = 20 * 1024 * 1024
export const STUDENT_DELIVERY_SPOKEN_PCT_MIN = 70

/** Prompt stored on speech_jobs and sent to OpenAI — the exact wheel topic label. */
export function buildWheelSpeechPrompt(topic: string): string {
  return topic.trim()
}

export interface SpeechFeedbackPayload {
  transcript: string
  overall_score: number
  feedback: string
  grammar_corrections?: Array<{ mistake: string; correction: string }>
  vocabulary_corrections?: Array<{ mistake: string; correction: string }>
  is_off_topic?: boolean
  integrity?: unknown
}

export function getStudentSpeechPollDelayMs(): number {
  const base =
    typeof document !== 'undefined' && document.visibilityState === 'visible'
      ? POLL_INTERVAL_MS
      : POLL_INTERVAL_BACKGROUND_MS
  return base + Math.floor(Math.random() * (POLL_JITTER_MS + 1))
}

export function getStudentMinWords(cefrLevel?: string | null): number {
  const l = (cefrLevel || 'A1').toUpperCase().trim()
  if (l === 'A1' || l === 'A2') return 12
  if (l === 'B1' || l === 'B2') return 20
  if (l === 'C1' || l === 'C2') return 30
  return 12
}

export function triggerSpeechAnalysisBackground(jobId: string): void {
  fetch('/.netlify/functions/run-speech-analysis-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  }).catch(() => {})
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export async function parseSpeechApiJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  const contentType = res.headers.get('content-type') || ''
  if (
    (!contentType.includes('application/json') && text.trimStart().startsWith('<')) ||
    text.trimStart().startsWith('<!')
  ) {
    throw new Error(
      'Speech API returned a web page instead of JSON. Run the app with Netlify functions (e.g. npm run dev:netlify).'
    )
  }
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new Error('Invalid response from speech API. Check that Netlify functions are running.')
  }
}

export function getSupportedRecordingMimeType(): string {
  const isIOSDevice =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isIOSDevice) {
    const iosTypes = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2']
    return iosTypes.find((type) => MediaRecorder.isTypeSupported(type)) || 'audio/mp4'
  }

  const preferredTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
  ]
  return preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || 'audio/webm'
}

export async function requestWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000)
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeoutId)
      return response
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
  throw lastError
}

export type SpeechJobErrorKind =
  | 'generic'
  | 'min_words'
  | 'question_repetition'
  | 'ai_flagged'
  | 'delivery_read'
  | 'too_long'

export async function submitSpeechForFeedback(params: {
  audioBlob: Blob
  recordingDurationSec: number
  prompt: string
  promptId: string
  lessonId: string
  userId?: string
  minWords?: number
  cefrLevel?: string
}): Promise<SpeechFeedbackPayload> {
  const {
    audioBlob,
    recordingDurationSec,
    prompt,
    promptId,
    lessonId,
    userId,
    minWords = getStudentMinWords(params.cefrLevel),
    cefrLevel = 'A1',
  } = params

  if (!audioBlob || audioBlob.size < 1000) {
    throw Object.assign(new Error('Audio recording is too short. Please record again.'), {
      kind: 'generic' as SpeechJobErrorKind,
    })
  }
  if (recordingDurationSec > STUDENT_MAX_RECORDING_SECONDS) {
    throw Object.assign(new Error('Please speak for less than 2 minutes.'), {
      kind: 'too_long' as SpeechJobErrorKind,
    })
  }
  if (audioBlob.size > STUDENT_MAX_AUDIO_BYTES) {
    throw Object.assign(new Error('Recording is too large. Please speak for less than 2 minutes.'), {
      kind: 'too_long' as SpeechJobErrorKind,
    })
  }

  const base64Audio = await blobToBase64(audioBlob)

  const speechJobRes = await requestWithRetry('/.netlify/functions/speech-job', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_blob: base64Audio,
      audio_mime_type: audioBlob.type || 'audio/webm',
      prompt,
      prompt_id: promptId,
      cefr_level: cefrLevel,
      min_words: minWords,
      duration_seconds: Math.round(recordingDurationSec),
      user_id: userId,
      lesson_id: lessonId,
    }),
  })

  if (!speechJobRes.ok) {
    const errBody = await parseSpeechApiJson(speechJobRes).catch(() => ({}))
    throw Object.assign(new Error((errBody.error as string) || `Request failed: ${speechJobRes.status}`), {
      kind: 'generic' as SpeechJobErrorKind,
    })
  }

  const { jobId } = (await parseSpeechApiJson(speechJobRes)) as { jobId?: string }
  if (!jobId) {
    throw Object.assign(new Error('No job ID returned from server.'), { kind: 'generic' as SpeechJobErrorKind })
  }

  triggerSpeechAnalysisBackground(jobId)

  const pollResult = async () => {
    const res = await fetch(
      `/.netlify/functions/analysis-result?id=${encodeURIComponent(jobId)}`,
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
    return parseSpeechApiJson(res)
  }

  let data = await pollResult()
  while (data.status === 'processing' || data.status === 'analyzing') {
    await new Promise((r) => setTimeout(r, getStudentSpeechPollDelayMs()))
    data = await pollResult()
  }

  if (data.status === 'failed') {
    const result = (data.result || {}) as Record<string, unknown>
    if (result.reason === 'question_repetition') {
      throw Object.assign(
        new Error(
          (data.error as string) ||
            'It sounds like you repeated the question. Please answer in your own words.'
        ),
        { kind: 'question_repetition' as SpeechJobErrorKind }
      )
    }
    if (result.min_words != null && result.word_count != null) {
      throw Object.assign(
        new Error(
          (data.error as string) ||
            `Please speak at least ${result.min_words} words. You said ${result.word_count} word(s).`
        ),
        { kind: 'min_words' as SpeechJobErrorKind }
      )
    }
    throw Object.assign(new Error((data.error as string) || 'Analysis failed.'), {
      kind: 'generic' as SpeechJobErrorKind,
    })
  }

  const result = (data.result || {}) as Record<string, unknown>
  const transcript = String(data.transcript ?? result.transcript ?? '')

  if (
    result.min_words != null &&
    result.word_count != null &&
    (result.word_count as number) < (result.min_words as number)
  ) {
    throw Object.assign(
      new Error(
        (result.error as string) ||
          `Please speak at least ${result.min_words} words. You said ${result.word_count} word(s).`
      ),
      { kind: 'min_words' as SpeechJobErrorKind }
    )
  }

  const flagged =
    (result?.integrity as { flagged?: boolean } | undefined)?.flagged === true ||
    result?.ai_flagged === true ||
    result?.flagged === true
  if (flagged) {
    throw Object.assign(
      new Error(
        (result?.integrity as { message?: string } | undefined)?.message ||
          'Your answer was flagged. Please try again using your own words.'
      ),
      { kind: 'ai_flagged' as SpeechJobErrorKind }
    )
  }

  const delivery = (result?.delivery ?? (result?.feedback as { delivery?: unknown })?.delivery) as
    | { spoken_pct?: number }
    | undefined
  const spokenPct = typeof delivery?.spoken_pct === 'number' ? delivery.spoken_pct : 100
  if (spokenPct < STUDENT_DELIVERY_SPOKEN_PCT_MIN) {
    throw Object.assign(
      new Error('Please speak in your own words instead of reading. Re-record your answer.'),
      { kind: 'delivery_read' as SpeechJobErrorKind }
    )
  }

  if (typeof result.overall_score !== 'number') {
    throw Object.assign(new Error('Something went wrong. Please try again.'), {
      kind: 'generic' as SpeechJobErrorKind,
    })
  }

  return {
    transcript,
    overall_score: result.overall_score as number,
    feedback: (result.feedback as string) || '',
    grammar_corrections: (result.grammar_corrections as SpeechFeedbackPayload['grammar_corrections']) || [],
    vocabulary_corrections:
      (result.vocabulary_corrections as SpeechFeedbackPayload['vocabulary_corrections']) || [],
    is_off_topic: Boolean(result.is_off_topic),
    integrity: result.integrity,
  }
}
