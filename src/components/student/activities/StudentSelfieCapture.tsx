'use client'

import React, { useRef, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

const MAX_BYTES = 5 * 1024 * 1024

export default function StudentSelfieCapture({ activity, onComplete }: StudentActivityProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const startCamera = async () => {
    setError(null)
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      setStream(media)
      if (videoRef.current) {
        videoRef.current.srcObject = media
        await videoRef.current.play()
      }
    } catch {
      setError('Could not open camera. You can skip and continue (photo optional).')
    }
  }

  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
  }

  const capture = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    const approxBytes = Math.ceil((dataUrl.length * 3) / 4)
    if (approxBytes > MAX_BYTES) {
      setError('Image is too large. Try again closer to the camera.')
      return
    }
    setPreview(dataUrl)
    stopCamera()
  }

  const handleContinue = async (skipped: boolean) => {
    setBusy(true)
    setError(null)
    try {
      onComplete({
        score: 1,
        maxScore: 1,
        attempts: 1,
        answers: {
          skipped,
          selfie_data_url: skipped ? null : preview,
          savedAt: new Date().toISOString(),
        },
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4 sm:p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-slate-800 mb-2">
        {activity.title || 'Your hero face'}
      </h2>
      {activity.description && (
        <p className="text-sm text-slate-600 mb-4">{activity.description}</p>
      )}

      {preview ? (
        <div className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selfie preview" className="rounded-lg max-h-64 mx-auto border" />
        </div>
      ) : stream ? (
        <video ref={videoRef} className="w-full rounded-lg bg-black mb-4 max-h-64" playsInline muted />
      ) : null}

      {error && <p className="text-sm text-amber-700 mb-3">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {!stream && !preview && (
          <Button onClick={startCamera}>Open camera</Button>
        )}
        {stream && (
          <>
            <Button onClick={capture}>Take photo</Button>
            <Button variant="secondary" onClick={stopCamera}>
              Cancel
            </Button>
          </>
        )}
        {preview && (
          <Button variant="secondary" onClick={() => setPreview(null)}>
            Retake
          </Button>
        )}
        <Button disabled={busy} onClick={() => handleContinue(!preview)}>
          {preview ? 'Continue' : 'Skip for now'}
        </Button>
      </div>
    </Card>
  )
}
