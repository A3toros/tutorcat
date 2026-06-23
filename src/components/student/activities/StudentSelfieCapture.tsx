'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button, Card } from '@/components/ui'
import {
  SELFIE_MAX_BYTES,
  compressImageSourceToDataUrl,
  fileToImage,
} from '@/lib/compressImageToDataUrl'
import type { StudentActivityProps } from '../activityProps'

type Phase = 'intro' | 'pick' | 'live' | 'preview'

const DEFAULT_DESCRIPTION =
  'Add a photo for your hero portrait. Tap Start, then take a new photo or choose one from your gallery.'

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function cameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Camera permission was denied. Tap Allow when your phone or browser asks, or choose from gallery.'
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'No camera found. Choose a photo from your gallery instead.'
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'Camera is in use by another app. Close it and try again, or choose from gallery.'
    }
  }
  return 'Could not open the camera. Try again or choose from gallery.'
}

export default function StudentSelfieCapture({ activity, onComplete }: StudentActivityProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraFileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [phase, setPhase] = useState<Phase>('intro')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [processing, setProcessing] = useState(false)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    },
    [],
  )

  useEffect(() => {
    const video = videoRef.current
    const media = stream
    if (!video || !media) return

    video.srcObject = media
    video.setAttribute('playsinline', 'true')
    video.setAttribute('webkit-playsinline', 'true')

    const startPlayback = async () => {
      try {
        await video.play()
      } catch {
        setError('Could not start camera preview. Try again or choose from gallery.')
      }
    }

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      void startPlayback()
    } else {
      video.onloadedmetadata = () => {
        void startPlayback()
      }
    }

    return () => {
      video.onloadedmetadata = null
      if (video.srcObject === media) {
        video.srcObject = null
      }
    }
  }, [stream])

  const applyCompressedPreview = async (source: HTMLImageElement | HTMLVideoElement) => {
    setProcessing(true)
    setError(null)
    try {
      const dataUrl = await compressImageSourceToDataUrl(source, SELFIE_MAX_BYTES)
      setPreview(dataUrl)
      stopCamera()
      setPhase('preview')
    } catch {
      setError('Could not process that photo. Try another image or take a new one.')
    } finally {
      setProcessing(false)
    }
  }

  const openNativeCameraPicker = () => {
    setError(null)
    cameraFileInputRef.current?.click()
  }

  const startLiveCamera = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      if (isMobileDevice()) {
        openNativeCameraPicker()
        return
      }
      setError('Camera is not supported here. Choose a photo from your gallery.')
      return
    }

    try {
      stopCamera()
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' } },
        audio: false,
      })
      streamRef.current = media
      setStream(media)
      setPhase('live')
    } catch (err) {
      if (isMobileDevice()) {
        setError(
          `${cameraErrorMessage(err)} You can also use your phone camera app below.`
        )
        openNativeCameraPicker()
        return
      }
      setError(cameraErrorMessage(err))
    }
  }

  const handleTakePhoto = () => {
    void startLiveCamera()
  }

  const handleChooseGallery = () => {
    setError(null)
    galleryInputRef.current?.click()
  }

  const captureFromVideo = async () => {
    const video = videoRef.current
    if (!video || processing) return
    if (!video.videoWidth || !video.videoHeight) {
      setError('Camera is still starting. Wait a moment, then tap Capture again.')
      return
    }
    await applyCompressedPreview(video)
  }

  const handleFileSelected = async (file: File | undefined) => {
    if (!file || processing) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    setProcessing(true)
    setError(null)
    try {
      const img = await fileToImage(file)
      await applyCompressedPreview(img)
    } catch {
      setError('Could not load that image. Try another file.')
      setProcessing(false)
    }
  }

  const handleRetake = () => {
    setPreview(null)
    setError(null)
    stopCamera()
    setPhase('pick')
  }

  const handleBackFromLive = () => {
    stopCamera()
    setError(null)
    setPhase('pick')
  }

  const handleContinue = () => {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      onComplete({
        score: 1,
        maxScore: 1,
        attempts: 1,
        answers: {
          skipped: false,
          selfie_data_url: preview,
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
      <p className="text-sm text-slate-600 mb-4">
        {activity.description || DEFAULT_DESCRIPTION}
      </p>

      {phase === 'preview' && preview ? (
        <div className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selfie preview" className="rounded-lg max-h-64 mx-auto border" />
        </div>
      ) : phase === 'live' && stream ? (
        <>
          <video
            ref={videoRef}
            className="w-full min-h-48 rounded-lg bg-black mb-2 max-h-64 object-cover"
            playsInline
            muted
            autoPlay
            style={{ transform: 'scaleX(-1)' }}
          />
          <p className="text-xs text-slate-500 mb-4">
            {isMobileDevice()
              ? 'Tap Allow if your phone asks for camera access, then tap Capture.'
              : 'Tap Allow if your browser asks for camera access, then tap Capture.'}
          </p>
        </>
      ) : processing ? (
        <p className="text-sm text-slate-600 mb-4">Compressing your photo…</p>
      ) : null}

      {error && <p className="text-sm text-amber-700 mb-3">{error}</p>}

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFileSelected(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={cameraFileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          void handleFileSelected(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <div className="flex flex-wrap gap-2">
        {phase === 'intro' && (
          <Button className="w-full" onClick={() => setPhase('pick')}>
            Start
          </Button>
        )}

        {phase === 'pick' && !processing && (
          <>
            <Button className="w-full sm:w-auto" onClick={handleTakePhoto}>
              Take a photo
            </Button>
            <Button className="w-full sm:w-auto" variant="secondary" onClick={handleChooseGallery}>
              Choose from gallery
            </Button>
          </>
        )}

        {phase === 'live' && stream && (
          <>
            <Button onClick={captureFromVideo} disabled={processing}>
              {processing ? 'Saving…' : 'Capture'}
            </Button>
            <Button variant="secondary" onClick={handleBackFromLive} disabled={processing}>
              Back
            </Button>
            {isMobileDevice() && (
              <Button variant="secondary" onClick={openNativeCameraPicker} disabled={processing}>
                Use phone camera app
              </Button>
            )}
          </>
        )}

        {phase === 'preview' && preview && (
          <>
            <Button variant="secondary" onClick={handleRetake}>
              Retake
            </Button>
            <Button disabled={busy || processing} onClick={handleContinue}>
              Continue
            </Button>
          </>
        )}
      </div>

      <p className="text-xs text-slate-500 mt-4">
        A photo is required. Large images are compressed to about 3&nbsp;MB or less.
      </p>
    </Card>
  )
}
