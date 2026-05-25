'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, MascotThinking } from '@/components/ui'
import { useUser } from '@/components/student/StudentProtectedRoute'
import {
  getSupportedRecordingMimeType,
  getStudentMinWords,
  SpeechFeedbackPayload,
  SpeechJobErrorKind,
  STUDENT_MAX_RECORDING_SECONDS,
  submitSpeechForFeedback,
} from '@/lib/studentSpeechApi'

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
  /** Called when the student taps Re-record so the parent can unlock Next / Finish. */
  onRerecord?: () => void
}

type Step = 'idle' | 'recording' | 'transcribing' | 'analyzing' | 'feedback'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function StudentSpeakingRecorder({
  promptText,
  promptId,
  lessonId,
  minWords,
  maxRecordingSeconds = 60,
  cefrLevel = 'A1',
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
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<SpeechJobErrorKind | null>(null)
  const [feedback, setFeedback] = useState<SpeechFeedbackPayload | null>(null)
  const [transcript, setTranscript] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingStartRef = useRef<number>(0)

  const effectiveMinWords = minWords ?? getStudentMinWords(cefrLevel)

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
    setError(null)
    setErrorKind(null)
    setStep('idle')
    chunksRef.current = []
  }, [cleanupStream])

  useEffect(() => {
    return () => cleanupStream()
  }, [cleanupStream])

  useEffect(() => {
    const check = async () => {
      try {
        if (navigator.permissions) {
          const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
          if (status.state === 'granted') setHasMicPermission(true)
        }
      } catch {
        /* ignore */
      }
    }
    check()
  }, [])

  const requestMicPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setHasMicPermission(true)
      setError(null)
      stream.getTracks().forEach((t) => t.stop())
    } catch (err) {
      const e = err as Error
      setError(
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
      setError(null)
      setErrorKind(null)

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
        })
        setTranscript(result.transcript)
        setFeedback(result)
        setStep('feedback')
        onSuccess(result)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Processing failed. Please try again.'
        const kind = (err as { kind?: SpeechJobErrorKind })?.kind ?? 'generic'
        setError(message)
        setErrorKind(kind)
        setStep('idle')
      } finally {
        setIsProcessing(false)
        setIsStopping(false)
        cleanupStream()
      }
    },
    [
      promptText,
      promptId,
      lessonId,
      user?.id,
      effectiveMinWords,
      cefrLevel,
      onSuccess,
      cleanupStream,
    ]
  )

  const startRecording = async () => {
    if (disabled || isRecording || isProcessing || isStopping || step === 'feedback') return

    setIsStopping(false)
    setFeedback(null)
    setTranscript('')
    setError(null)
    setErrorKind(null)

    try {
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      const stream = await navigator.mediaDevices.getUserMedia(
        isIOS ? { audio: { echoCancellation: true } } : { audio: true }
      )
      streamRef.current = stream
      chunksRef.current = []
      setHasMicPermission(true)

      const mimeType = getSupportedRecordingMimeType()
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
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
          if (next >= maxRecordingSeconds && mediaRecorderRef.current?.state === 'recording') {
            stopRecording()
            return maxRecordingSeconds
          }
          return next
        })
      }, 1000)

      autoStopTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording()
        }
      }, maxRecordingSeconds * 1000)
    } catch {
      setError('Failed to start recording. Check your microphone and try again.')
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

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
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
        <Button
          onClick={requestMicPermission}
          disabled={disabled}
          className="inline-flex items-center gap-2"
        >
          <img src="/mic-start.png" alt="" className="w-5 h-5" aria-hidden />
          Allow microphone
        </Button>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </div>
    )
  }

  if (step === 'transcribing' || step === 'analyzing' || isProcessing) {
    return (
      <div className="py-6 flex flex-col items-center">
        <MascotThinking
          size="md"
          speechText={
            step === 'analyzing' ? 'Analyzing your answer…' : 'Transcribing your speech…'
          }
          alwaysShowSpeech
        />
      </div>
    )
  }

  if (step === 'feedback' && feedback) {
    return (
      <div className="space-y-4 text-left">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-xs font-semibold uppercase text-green-700 mb-1">AI feedback</p>
          <p className="text-sm text-slate-800 mb-2">{feedback.feedback}</p>
          <p className="text-xs text-slate-500">
            Score: <strong>{feedback.overall_score}/100</strong>
          </p>
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
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 text-center">
        Speak for at least {effectiveMinWords} words. Max {Math.min(maxRecordingSeconds, STUDENT_MAX_RECORDING_SECONDS)}s.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <Button
            variant="secondary"
            size="sm"
            className="mt-2 w-full"
            onClick={resetRecording}
          >
            {errorKind === 'min_words' || errorKind === 'delivery_read' ? 'Re-record' : 'Try again'}
          </Button>
        </div>
      )}

      {!error && (
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
                style={{
                  opacity: disabled ? 0.5 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
                onError={(e) => {
                  console.error('Failed to load mic-start.png')
                  e.currentTarget.style.display = 'none'
                }}
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
                      recordingTime >= maxRecordingSeconds - 5 ? 'text-rose-600' : 'text-slate-800'
                    }`}
                  >
                    Recording: {formatTime(recordingTime)}
                    {recordingTime >= maxRecordingSeconds - 5 &&
                      recordingTime < maxRecordingSeconds && (
                        <span className="ml-2 text-sm font-normal">(stopping soon…)</span>
                      )}
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
                  isStopping
                    ? 'opacity-50 grayscale cursor-not-allowed'
                    : 'cursor-pointer hover:opacity-80'
                }`}
                onClick={isStopping ? undefined : stopRecording}
                onKeyDown={(e) => {
                  if (!isStopping && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    stopRecording()
                  }
                }}
                onError={(e) => {
                  console.error('Failed to load mic-stop.png')
                  e.currentTarget.style.display = 'none'
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
