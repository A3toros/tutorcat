'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, MascotThinking } from '@/components/ui'
import { useUser } from '@/components/student/StudentProtectedRoute'
import {
  getMinWordsForLevel,
  getSupportedRecordingMimeType,
  SPEECH_MAX_DURATION_SECONDS,
  submitSpeechForFeedback,
  type SpeechErrorFlags,
  type SpeechFeedbackPayload,
} from '@/lib/speechJobFlow'

export type { SpeechFeedbackPayload }

export interface StudentSpeakingRecorderProps {
  promptText: string
  promptId: string
  lessonId: string
  minWords?: number
  maxRecordingSeconds?: number
  cefrLevel?: string
  disabled?: boolean
  onSuccess: (result: SpeechFeedbackPayload) => void
  onRerecord?: () => void
}

type Step = 'idle' | 'recording' | 'transcribing' | 'analyzing' | 'feedback'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function errorTitle(flags: SpeechErrorFlags): string {
  if (flags.isMinWordsError) return 'Not enough words'
  if (flags.isQuestionRepetitionError) return 'Please re-record'
  if (flags.isDeliveryReadError) return "Speak, don't read"
  if (flags.isAIFlaggedError) return 'Flagged'
  if (flags.isSpeechTooLongError) return 'Speech too long'
  return 'Something went wrong'
}

export default function StudentSpeakingRecorder({
  promptText,
  promptId,
  lessonId,
  minWords,
  maxRecordingSeconds = 60,
  cefrLevel,
  disabled = false,
  onSuccess,
  onRerecord,
}: StudentSpeakingRecorderProps) {
  const { user } = useUser()
  const [hasMicPermission, setHasMicPermission] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  const [isRecording, setIsRecording] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [errorFlags, setErrorFlags] = useState<SpeechErrorFlags>({})
  const [feedback, setFeedback] = useState<SpeechFeedbackPayload | null>(null)
  const [transcript, setTranscript] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingStartRef = useRef<number>(0)

  const effectiveMinWords = minWords ?? getMinWordsForLevel(cefrLevel)
  const maxSeconds = Math.min(maxRecordingSeconds, SPEECH_MAX_DURATION_SECONDS)

  const cleanupStream = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current)
      autoStopTimeoutRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
  }, [])

  const resetRecording = useCallback(() => {
    cleanupStream()
    setIsRecording(false)
    setIsStopping(false)
    setIsProcessing(false)
    setRecordingTime(0)
    setSubmissionError(null)
    setErrorFlags({})
    setStep('idle')
    chunksRef.current = []
  }, [cleanupStream])

  useEffect(() => () => cleanupStream(), [cleanupStream])

  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        if (s.state === 'granted') setHasMicPermission(true)
      })
      .catch(() => {})
  }, [])

  const requestMicPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setHasMicPermission(true)
      setSubmissionError(null)
      stream.getTracks().forEach((t) => t.stop())
    } catch (err) {
      const e = err as Error
      setSubmissionError(
        e.name === 'NotAllowedError'
          ? 'Microphone access denied. Allow the microphone in your browser settings.'
          : `Microphone error: ${e.message}`
      )
    }
  }

  const processRecording = useCallback(
    async (audioBlob: Blob, durationSec: number) => {
      setIsProcessing(true)
      setStep('transcribing')
      setSubmissionError(null)
      setErrorFlags({})

      try {
        const result = await submitSpeechForFeedback({
          audioBlob,
          recordingDurationSec: durationSec,
          prompt: promptText,
          promptId,
          lessonId,
          userId: user?.id,
          minWords: effectiveMinWords,
          cefrLevel,
          onPollStatus: (status) =>
            setStep(status === 'analyzing' ? 'analyzing' : 'transcribing'),
        })
        setTranscript(result.transcript)
        setFeedback(result)
        setStep('feedback')
        onSuccess(result)
      } catch (err: unknown) {
        const e = err as Error & SpeechErrorFlags
        setSubmissionError(e.message || 'Processing failed. Please try again.')
        setErrorFlags({
          isMinWordsError: e.isMinWordsError,
          isAIFlaggedError: e.isAIFlaggedError,
          isSpeechTooLongError: e.isSpeechTooLongError,
          isQuestionRepetitionError: e.isQuestionRepetitionError,
          isDeliveryReadError: e.isDeliveryReadError,
        })
        setStep('idle')
      } finally {
        setIsProcessing(false)
        setIsStopping(false)
        cleanupStream()
      }
    },
    [promptText, promptId, lessonId, user?.id, effectiveMinWords, cefrLevel, onSuccess, cleanupStream]
  )

  const startRecording = async () => {
    if (disabled || isRecording || isProcessing || isStopping || step === 'feedback') return

    setIsStopping(false)
    setFeedback(null)
    setTranscript('')
    setSubmissionError(null)
    setErrorFlags({})

    try {
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      const stream = await navigator.mediaDevices.getUserMedia(
        isIOS
          ? { audio: { echoCancellation: true } }
          : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
      )
      streamRef.current = stream
      chunksRef.current = []
      setHasMicPermission(true)

      const mimeType = getSupportedRecordingMimeType()
      const mediaRecorder = new MediaRecorder(
        stream,
        isIOS ? { mimeType } : { mimeType, audioBitsPerSecond: 64000 }
      )
      mediaRecorderRef.current = mediaRecorder
      recordingStartRef.current = Date.now()

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const durationSec = Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000))
        await processRecording(blob, durationSec)
      }

      mediaRecorder.start(isIOS ? 1000 : undefined)
      setIsRecording(true)
      setStep('recording')
      setRecordingTime(0)

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const next = prev + 1
          if (next >= maxSeconds && mediaRecorderRef.current?.state === 'recording') {
            stopRecording()
            return maxSeconds
          }
          return next
        })
      }, 1000)

      autoStopTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') stopRecording()
      }, maxSeconds * 1000)
    } catch {
      setSubmissionError('Failed to start recording. Check your microphone and try again.')
    }
  }

  const stopRecording = () => {
    if (!isRecording || isStopping) return

    setIsStopping(true)
    setIsRecording(false)
    setIsProcessing(true)
    setStep('transcribing')

    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current)
      autoStopTimeoutRef.current = null
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }

    const mediaRecorder = mediaRecorderRef.current
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.requestData()
      mediaRecorder.stop()
      return
    }

    cleanupStream()
    setIsStopping(false)
    setIsProcessing(false)
    setStep('idle')
  }

  if (!hasMicPermission) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
        <p className="text-sm text-amber-900 mb-3">
          Allow the microphone so we can transcribe your speech and give AI feedback.
        </p>
        <Button onClick={requestMicPermission} disabled={disabled} className="inline-flex items-center gap-2">
          <img src="/mic-start.png" alt="" className="w-5 h-5" aria-hidden />
          Allow microphone
        </Button>
        {submissionError && <p className="text-red-600 text-sm mt-2">{submissionError}</p>}
      </div>
    )
  }

  if (step === 'transcribing' || step === 'analyzing' || isProcessing) {
    return (
      <div className="py-6 flex flex-col items-center">
        <MascotThinking
          size="md"
          speechText={step === 'analyzing' ? 'Analyzing your answer…' : 'Transcribing your speech…'}
          alwaysShowSpeech
        />
      </div>
    )
  }

  if (step === 'feedback' && feedback) {
    const passed = feedback.overall_score >= 50
    return (
      <div className="space-y-4 text-left">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs font-semibold uppercase text-green-700 mb-1">AI feedback</p>
          <p className="text-sm text-slate-800 mb-2">{feedback.feedback}</p>
        </div>

        {transcript && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-500 mb-1">What we heard</p>
            <p className="text-sm text-slate-700 italic">&ldquo;{transcript}&rdquo;</p>
          </div>
        )}

        {feedback.grammar_corrections && feedback.grammar_corrections.length > 0 && (
          <div className="text-sm">
            <p className="font-semibold text-slate-700 mb-1">Grammar</p>
            {feedback.grammar_corrections.slice(0, 3).map((c, i) => (
              <p key={i} className="text-slate-600">
                <span className="line-through text-red-600">{c.mistake}</span>
                {' → '}
                <span className="text-green-700">{c.correction}</span>
              </p>
            ))}
          </div>
        )}

        {feedback.vocabulary_corrections && feedback.vocabulary_corrections.length > 0 && (
          <div className="text-sm">
            <p className="font-semibold text-slate-700 mb-1">Vocabulary</p>
            {feedback.vocabulary_corrections.slice(0, 3).map((c, i) => (
              <p key={i} className="text-slate-600">
                <span className="line-through text-red-600">{c.mistake}</span>
                {' → '}
                <span className="text-green-700">{c.correction}</span>
              </p>
            ))}
          </div>
        )}

        {feedback.overall_score < 60 && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Try again for a stronger answer — tap Re-record below.
          </p>
        )}

        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-fuchsia-50 via-purple-50 to-indigo-50 px-4 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">Your score</p>
          <p className="mt-1 text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 tabular-nums">
            {feedback.overall_score}
          </p>
          <p className="text-sm font-semibold text-slate-700">out of 100</p>
          {!passed && (
            <p className="mt-2 text-sm text-rose-700">
              Score is under 50 — please re-record to continue.
            </p>
          )}
        </div>

        {!passed && (
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => {
              setFeedback(null)
              setTranscript('')
              resetRecording()
              onRerecord?.()
            }}
          >
            Re-record
          </Button>
        )}
      </div>
    )
  }

  const showError = Boolean(submissionError)
  const canRerecord =
    errorFlags.isMinWordsError ||
    errorFlags.isDeliveryReadError ||
    errorFlags.isQuestionRepetitionError ||
    errorFlags.isAIFlaggedError ||
    errorFlags.isSpeechTooLongError

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 text-center">
        Say at least {effectiveMinWords} words in your answer (up to {maxSeconds} seconds).
      </p>

      {showError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p className="font-semibold text-amber-900">{errorTitle(errorFlags)}</p>
          <p className="mt-1">{submissionError}</p>
          {errorFlags.isMinWordsError && (
            <p className="mt-2 text-xs text-amber-800">
              Tap Re-record and speak for longer to meet the minimum word count.
            </p>
          )}
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={resetRecording}>
            {canRerecord ? 'Re-record' : 'Try again'}
          </Button>
        </div>
      )}

      {!showError && (
        <div className="flex flex-col items-center gap-3">
          {!isRecording ? (
            <div className="flex flex-col items-center">
              <img
                src="/mic-start.png"
                alt="Start recording"
                role="button"
                tabIndex={disabled ? -1 : 0}
                className="w-16 h-16 cursor-pointer hover:opacity-80 transition-opacity touch-manipulation"
                onClick={disabled ? undefined : startRecording}
                onKeyDown={(e) => {
                  if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    startRecording()
                  }
                }}
                style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
              />
              <p className="text-xs text-slate-500 mt-2">Tap to start recording</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {isStopping ? (
                <p className="text-sm font-medium text-amber-700">
                  Stop pressed. Processing your recording…
                </p>
              ) : (
                <>
                  <p
                    className={`text-lg font-semibold tabular-nums ${
                      recordingTime >= maxSeconds - 5 ? 'text-rose-600' : 'text-slate-800'
                    }`}
                  >
                    Recording: {formatTime(recordingTime)}
                  </p>
                  <p className="text-sm text-slate-500">Tap the button below to stop</p>
                </>
              )}
              <img
                src="/mic-stop.png"
                alt="Stop recording"
                role="button"
                tabIndex={isStopping ? -1 : 0}
                className={`w-16 h-16 transition-all duration-200 touch-manipulation ${
                  isStopping ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer hover:opacity-80'
                }`}
                onClick={isStopping ? undefined : stopRecording}
                onKeyDown={(e) => {
                  if (!isStopping && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    stopRecording()
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
