'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchAndCacheVideo } from '@/lib/videoCache'

interface VideoPlayerProps {
  src: string
  className?: string
  autoPlay?: boolean
  loop?: boolean
  muted?: boolean
  controls?: boolean
  playsInline?: boolean
  poster?: string
  onLoadStart?: () => void
  onLoadedData?: () => void
  onError?: (error: Error) => void
}

export default function VideoPlayer({
  src,
  className = '',
  autoPlay = false,
  loop = false,
  muted = true,
  controls = true,
  playsInline = true,
  poster,
  onLoadStart,
  onLoadedData,
  onError,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isCached, setIsCached] = useState(false)

  useEffect(() => {
    let isMounted = true
    let objectUrl: string | null = null

    const loadVideo = async () => {
      try {
        setIsLoading(true)
        setError(null)
        onLoadStart?.()

        // Fetch and cache video
        const blob = await fetchAndCacheVideo(src)
        
        if (!isMounted) return

        // Create object URL from blob
        objectUrl = URL.createObjectURL(blob)
        setVideoUrl(objectUrl)
        setIsLoading(false)
        onLoadedData?.()
      } catch (err) {
        if (!isMounted) return
        
        const error = err instanceof Error ? err : new Error('Failed to load video')
        setError(error)
        setIsLoading(false)
        onError?.(error)
      }
    }

    loadVideo()

    return () => {
      isMounted = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [src, onLoadStart, onLoadedData, onError])

  // Check if video is cached
  useEffect(() => {
    const checkCache = async () => {
      try {
        const { getCachedVideo } = await import('@/lib/videoCache')
        const cached = await getCachedVideo(src)
        setIsCached(!!cached)
      } catch {
        setIsCached(false)
      }
    }
    checkCache()
  }, [src])

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-neutral-100 rounded-lg ${className}`}>
        <div className="text-center p-8">
          <p className="text-red-600 mb-2">Failed to load video</p>
          <p className="text-sm text-neutral-600">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 rounded-lg z-10">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            <p className="text-sm text-neutral-600">
              {isCached ? 'Loading from cache...' : 'Loading video...'}
            </p>
          </div>
        </div>
      )}
      
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full rounded-lg object-contain"
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          controls={controls}
          playsInline={playsInline}
          poster={poster}
          preload="metadata"
        />
      )}
    </div>
  )
}
