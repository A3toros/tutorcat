'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import {
  SELFIE_MAX_BYTES,
  compressImageSourceToDataUrl,
  fileToImage,
} from '@/lib/compressImageToDataUrl'

type Phase = 'intro' | 'pick' | 'live' | 'preview'

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

interface Props {
  photo: string | null
  onPhotoChange: (dataUrl: string | null) => void
  disabled?: boolean
}

export default function SuperheroSelfiePicker({ photo, onPhotoChange, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const cameraFileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [phase, setPhase] = useState<Phase>(photo ? 'preview' : 'intro')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
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
      onPhotoChange(dataUrl)
      stopCamera()
      setPhase('preview')
    } catch {
      setError('Could not process that photo. Try another image or take a new one.')
    } finally {
      setProcessing(false)
    }
  }

  const openNativeCameraPicker = () => {
    if (disabled) return
    setError(null)
    cameraFileInputRef.current?.click()
  }

  const startLiveCamera = async () => {
    if (disabled) return
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
        setError(`${cameraErrorMessage(err)} You can also use your phone camera app below.`)
        openNativeCameraPicker()
        return
      }
      setError(cameraErrorMessage(err))
    }
  }

  const handleFileSelected = async (file: File | undefined) => {
    if (!file || processing || disabled) return
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
    onPhotoChange(null)
    setError(null)
    stopCamera()
    setPhase('pick')
  }

  const preview = photo

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <p className="text-sm font-medium text-slate-800 mb-2">Your photo</p>
      <p className="text-xs text-slate-500 mb-3">
        Tap Start, then take a photo or choose from gallery. Required before we draw your hero.
      </p>

      {phase === 'preview' && preview ? (
        <div className="mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Your photo" className="rounded-lg max-h-40 mx-auto border" />
        </div>
      ) : phase === 'live' && stream ? (
        <>
          <video
            ref={videoRef}
            className="w-full min-h-40 rounded-lg bg-black mb-2 max-h-48 object-cover"
            playsInline
            muted
            autoPlay
            style={{ transform: 'scaleX(-1)' }}
          />
          <p className="text-xs text-slate-500 mb-3">
            {isMobileDevice()
              ? 'Tap Allow if your phone asks for camera access, then tap Capture.'
              : 'Tap Allow if your browser asks for camera access, then tap Capture.'}
          </p>
        </>
      ) : processing ? (
        <p className="text-sm text-slate-600 mb-3">Compressing your photo…</p>
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
        {phase === 'intro' && !preview && (
          <Button className="w-full sm:w-auto" onClick={() => setPhase('pick')} disabled={disabled}>
            Start
          </Button>
        )}

        {phase === 'pick' && !processing && (
          <>
            <Button className="w-full sm:w-auto" onClick={() => void startLiveCamera()} disabled={disabled}>
              Take a photo
            </Button>
            <Button
              className="w-full sm:w-auto"
              variant="secondary"
              onClick={() => galleryInputRef.current?.click()}
              disabled={disabled}
            >
              Choose from gallery
            </Button>
          </>
        )}

        {phase === 'live' && stream && (
          <>
            <Button
              onClick={() => {
                const video = videoRef.current
                if (!video || processing) return
                if (!video.videoWidth || !video.videoHeight) {
                  setError('Camera is still starting. Wait a moment, then tap Capture again.')
                  return
                }
                void applyCompressedPreview(video)
              }}
              disabled={processing || disabled}
            >
              {processing ? 'Saving…' : 'Capture'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                stopCamera()
                setError(null)
                setPhase('pick')
              }}
              disabled={processing || disabled}
            >
              Back
            </Button>
            {isMobileDevice() && (
              <Button variant="secondary" onClick={openNativeCameraPicker} disabled={processing || disabled}>
                Use phone camera app
              </Button>
            )}
          </>
        )}

        {phase === 'preview' && preview && (
          <Button variant="secondary" onClick={handleRetake} disabled={disabled || processing}>
            Change photo
          </Button>
        )}
      </div>
    </div>
  )
}
