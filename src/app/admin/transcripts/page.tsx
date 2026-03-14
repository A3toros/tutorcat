'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause, Square, FolderOpen, Download, Volume2 } from 'lucide-react'
import { Card, Button, Table, Header, Body, Row, Head, Cell, Input, Select } from '@/components/ui'
import { useNotification } from '@/contexts/NotificationContext'
import { adminApiRequest } from '@/utils/adminApi'

interface IntegritySignals {
  level_mismatch?: number
  off_syllabus_vocab?: number
  robotic_cues?: number
  [key: string]: any
}

interface Integrity {
  risk_score?: number
  flagged?: boolean
  message?: string
  signals?: IntegritySignals
  [key: string]: any
}

interface TranscriptItem {
  job_id: string
  user_id: string | null
  user_email: string | null
  lesson_id: string | null
  prompt: string | null
  prompt_id: string | null
  transcript: string
  status: string
  error: string | null
  integrity: Integrity | null
  created_at: string
  lesson_result?: any
}

export default function AdminTranscriptsPage() {
  const router = useRouter()
  const { showNotification } = useNotification()

  const [items, setItems] = useState<TranscriptItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [studentFilter, setStudentFilter] = useState('')
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set())
  const [playingJobId, setPlayingJobId] = useState<string | null>(null)
  const [loadingAudioJobId, setLoadingAudioJobId] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const [playErrorJobId, setPlayErrorJobId] = useState<string | null>(null)
  const [loadedJobId, setLoadedJobId] = useState<string | null>(null)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState<number>(0)
  const [shownFilename, setShownFilename] = useState<{ jobId: string; filename: string } | null>(null)
  const [loadingFilenameJobId, setLoadingFilenameJobId] = useState<string | null>(null)
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null)
  const [volume, setVolume] = useState(100)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)

  const formatTime = useCallback((sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [])

  const handlePlaySpeech = useCallback(
    async (jobId: string) => {
      const audio = audioRef.current
      // Resume if this job is already loaded and paused
      if (loadedJobId === jobId && playingJobId !== jobId && audio?.src) {
        if (audio.ended || audio.currentTime >= (audio.duration || 0) - 0.1) {
          audio.currentTime = 0
          setAudioCurrentTime(0)
        }
        audio.play().catch(() => {})
        setPlayingJobId(jobId)
        setPlayError(null)
        setPlayErrorJobId(null)
        return
      }
      // Pause if this job is currently playing
      if (playingJobId === jobId) {
        if (audio) {
          audio.pause()
          audio.src = ''
        }
        setPlayingJobId(null)
        setLoadedJobId(null)
        setAudioCurrentTime(0)
        setAudioDuration(0)
        setPlayError(null)
        setPlayErrorJobId(null)
        return
      }
      // Stop any other playback and load this job
      if (audio) {
        audio.pause()
        audio.src = ''
      }
      setPlayingJobId(null)
      setLoadedJobId(null)
      setAudioCurrentTime(0)
      setAudioDuration(0)
      setPlayError(null)
      setPlayErrorJobId(null)
      setLoadingAudioJobId(jobId)
      try {
        const res = await adminApiRequest(
          `/.netlify/functions/admin-get-speech-audio-url?jobId=${encodeURIComponent(jobId)}`,
          { method: 'GET' }
        )
        const data = await res.json()
        if (!data.success || !data.url) {
          setPlayError(data.error || 'Could not get audio URL')
          setPlayErrorJobId(jobId)
          setLoadingAudioJobId(null)
          return
        }
        const urls: string[] = Array.isArray(data.urls) ? data.urls : data.url ? [data.url] : []
        if (urls.length === 0) {
          setPlayError('No audio URL returned')
          setPlayErrorJobId(jobId)
          setLoadingAudioJobId(null)
          return
        }
        if (!audioRef.current) {
          setLoadingAudioJobId(null)
          return
        }
        const audioEl = audioRef.current
        // Fetch duration from Supabase features JSON (whisper_verbose.duration) so we show it even when the audio element reports 0
        adminApiRequest(`/.netlify/functions/admin-get-speech-audio-metadata?jobId=${encodeURIComponent(jobId)}`, { method: 'GET' })
          .then((r) => r.json())
          .then((meta) => {
            if (meta?.success && typeof meta.duration === 'number' && Number.isFinite(meta.duration) && meta.duration > 0) {
              setAudioDuration(meta.duration)
            }
          })
          .catch(() => {})
        let urlIndex = 0
        const tryNextUrl = () => {
          if (urlIndex >= urls.length) {
            setPlayError('Audio not found or failed to load')
            setPlayErrorJobId(jobId)
            setLoadingAudioJobId(null)
            return
          }
          const src = urls[urlIndex++]
          audioEl.src = src
          audioEl.load()
          audioEl.onloadedmetadata = () => {
            const d = audioEl.duration
            if (Number.isFinite(d) && d > 0) setAudioDuration(d)
          }
          audioEl.ondurationchange = () => {
            const d = audioEl.duration
            if (Number.isFinite(d) && d > 0) setAudioDuration(d)
          }
          audioEl.ontimeupdate = () => setAudioCurrentTime(audioEl.currentTime)
          audioEl.onended = () => {
            setPlayingJobId(null)
            setLoadingAudioJobId(null)
            setAudioCurrentTime(audioEl.duration)
          }
          audioEl.onpause = () => {
            if (audioEl.ended) return
            setPlayingJobId(null)
            setLoadingAudioJobId(null)
          }
          audioEl.onerror = () => tryNextUrl()
          audioEl.onplaying = () => {
            setPlayingJobId(jobId)
            setLoadedJobId(jobId)
            setLoadingAudioJobId(null)
            setPlayError(null)
            setPlayErrorJobId(null)
          }
          audioEl.play().catch(() => tryNextUrl())
        }
        tryNextUrl()
      } catch (e) {
        setPlayError((e as Error).message || 'Failed to load audio')
        setPlayErrorJobId(jobId)
        setLoadingAudioJobId(null)
      }
    },
    [playingJobId, loadedJobId]
  )

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    setPlayingJobId(null)
    setLoadedJobId(null)
    setLoadingAudioJobId(null)
    setAudioCurrentTime(0)
    setAudioDuration(0)
    setPlayError(null)
    setPlayErrorJobId(null)
  }, [])

  const handleShowFilename = useCallback(async (jobId: string) => {
    if (loadingFilenameJobId === jobId) return
    setLoadingFilenameJobId(jobId)
    setShownFilename(null)
    try {
      const res = await adminApiRequest(
        `/.netlify/functions/admin-get-speech-audio-filename?jobId=${encodeURIComponent(jobId)}`,
        { method: 'GET' }
      )
      const data = await res.json()
      if (data.success && data.filename) {
        setShownFilename({ jobId, filename: data.filename })
      } else {
        setShownFilename({ jobId, filename: data.error || 'Not found' })
      }
    } catch (e) {
      setShownFilename({ jobId, filename: (e as Error).message || 'Failed to load' })
    } finally {
      setLoadingFilenameJobId(null)
    }
  }, [loadingFilenameJobId])

  const handleDownload = useCallback(async (jobId: string) => {
    if (downloadingJobId === jobId) return
    setDownloadingJobId(jobId)
    try {
      const [urlRes, nameRes] = await Promise.all([
        adminApiRequest(`/.netlify/functions/admin-get-speech-audio-url?jobId=${encodeURIComponent(jobId)}`, { method: 'GET' }),
        adminApiRequest(`/.netlify/functions/admin-get-speech-audio-filename?jobId=${encodeURIComponent(jobId)}`, { method: 'GET' }),
      ])
      const urlData = await urlRes.json()
      const nameData = await nameRes.json()
      const downloadUrl = urlData.success && urlData.url ? urlData.url : null
      const filename = nameData.success && nameData.filename ? nameData.filename : `${jobId}.audio`
      if (!downloadUrl) {
        showNotification(urlData.error || 'Could not get audio URL', 'error')
        return
      }
      const response = await fetch(downloadUrl)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(objectUrl)
      showNotification(`Downloaded ${filename}`, 'success')
    } catch (e) {
      showNotification((e as Error).message || 'Download failed', 'error')
    } finally {
      setDownloadingJobId(null)
    }
  }, [downloadingJobId, showNotification])

  const handleTimelineSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = timelineRef.current
      const audio = audioRef.current
      if (!el || !audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const ratio = Math.max(0, Math.min(1, x / rect.width))
      const time = ratio * audio.duration
      audio.currentTime = time
      setAudioCurrentTime(time)
      audio.play().catch(() => {})
      if (loadedJobId) setPlayingJobId(loadedJobId)
    },
    [loadedJobId]
  )

  const loadTranscripts = useCallback(async () => {
    try {
      setIsLoading(true)

      const params = new URLSearchParams()
      params.set('scope', 'lessons')
      params.set('page', String(page))
      params.set('limit', '50')
      if (studentFilter.trim()) {
        params.set('userSearch', studentFilter.trim())
      }

      const response = await adminApiRequest(`/.netlify/functions/admin-speaking-flags?${params.toString()}`, {
        method: 'GET'
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      if (!result.success) {
        throw new Error(result.error || 'Failed to load transcripts')
      }

      const rawItems: TranscriptItem[] = result.items || []
      const filtered = onlyFlagged
        ? rawItems.filter((item) => item.integrity?.flagged)
        : rawItems

      setItems(filtered)
      if (result.pagination) {
        setTotalPages(result.pagination.totalPages || 1)
      }
    } catch (error) {
      console.error('Failed to load transcripts:', error)
      showNotification('Failed to load transcripts: ' + (error as Error).message, 'error')
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [page, studentFilter, onlyFlagged, showNotification])

  useEffect(() => {
    loadTranscripts()
  }, [loadTranscripts])

  // Smooth progress bar: sync currentTime every frame while playing (requestAnimationFrame)
  useEffect(() => {
    if (!playingJobId || !audioRef.current) return
    let rafId = 0
    const loop = () => {
      const audio = audioRef.current
      if (audio && !audio.paused) {
        setAudioCurrentTime(audio.currentTime)
      }
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [playingJobId])

  // Sync volume to audio element (0–100 → 0–1)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume / 100))
    }
  }, [volume, loadedJobId])

  const toggleExpanded = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const toggleActivityExpanded = (jobId: string) => {
    setExpandedActivities(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const formatDate = (value: string) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    // Adjust by +7 hours for display (e.g. local timezone offset)
    const adjusted = new Date(d.getTime() + 7 * 60 * 60 * 1000)
    return adjusted.toLocaleString()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 p-6">
      <audio ref={audioRef} className="hidden" />
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/dashboard')}>
              ← Back to Dashboard
            </Button>
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/improve-transcript-test')}>
              Test
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Speaking Transcripts</h1>
              <p className="text-slate-600 text-sm">
                View recent speech jobs with AI integrity flags.
              </p>
            </div>
          </div>
        </div>

        <Card className="border-purple-200 shadow-lg bg-white">
          <Card.Header>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center space-x-3">
                <Input
                  placeholder="Filter by student (e.g. email)"
                  value={studentFilter}
                  onChange={(e) => {
                    setStudentFilter(e.target.value)
                    setPage(1)
                  }}
                  className="w-56"
                />
                <Select
                  value={onlyFlagged ? 'flagged' : 'all'}
                  onChange={(e) => {
                    setOnlyFlagged(e.target.value === 'flagged')
                    setPage(1)
                  }}
                  className="w-40"
                >
                  <option value="all">All transcripts</option>
                  <option value="flagged">Only flagged</option>
                </Select>
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-sm text-slate-600">
                  Page {page} of {totalPages}
                </span>
                <div className="flex space-x-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= totalPages || isLoading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </Card.Header>

          <Card.Body>
            {isLoading ? (
              <div className="py-10 text-center text-slate-600">
                Loading transcripts...
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-slate-600">
                No transcripts found for the current filters.
              </div>
            ) : (
              <Table>
                <Header>
                  <Row>
                    <Head>User</Head>
                    <Head>Lesson</Head>
                    <Head>Prompt</Head>
                    <Head>Status</Head>
                    <Head>Risk</Head>
                    <Head>Flagged</Head>
                    <Head>Created</Head>
                    <Head>Activity</Head>
                    <Head>Actions</Head>
                  </Row>
                </Header>
                <Body>
                  {items.map((item) => {
                    const integrity = item.integrity || {}
                    const risk = typeof integrity.risk_score === 'number' ? integrity.risk_score : 0
                    const flagged = Boolean(integrity.flagged)
                    const isExpanded = expandedJobs.has(item.job_id)
                    const isActivityExpanded = expandedActivities.has(item.job_id)

                    const rawPrompt = item.prompt || ''
                    let lessonLabel = item.lesson_id || item.prompt_id || ''
                    let promptLabel = rawPrompt

                    if (!lessonLabel && rawPrompt) {
                      const [first, ...rest] = rawPrompt.split(' ')
                      if (rest.length > 0) {
                        lessonLabel = first
                        promptLabel = rest.join(' ')
                      }
                    }

                    return (
                      <React.Fragment key={item.job_id}>
                        <Row
                          className={
                            flagged
                              ? 'bg-red-50 border-l-4 border-red-400'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <Cell className="text-xs text-slate-700">
                            {item.user_email || item.user_id || '—'}
                          </Cell>
                          <Cell className="text-xs text-slate-700">
                            {lessonLabel || '—'}
                          </Cell>
                          <Cell className="text-xs text-slate-700 max-w-sm truncate">
                            {promptLabel || '—'}
                          </Cell>
                          <Cell className="text-xs">
                            <span
                              className={
                                item.status === 'completed'
                                  ? 'text-green-700'
                                  : item.status === 'failed'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                              }
                            >
                              {item.status}
                            </span>
                          </Cell>
                          <Cell className="text-xs">
                            {risk > 0 ? (
                              <span
                                className={
                                  risk >= 50
                                    ? 'px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-semibold'
                                    : risk >= 40
                                    ? 'px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold'
                                    : 'px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold'
                                }
                              >
                                {risk}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </Cell>
                          <Cell className="text-xs">
                            {flagged ? (
                              <span className="text-red-700 font-semibold">Yes</span>
                            ) : (
                              <span className="text-slate-500">No</span>
                            )}
                          </Cell>
                          <Cell className="text-xs text-slate-600">
                            {formatDate(item.created_at)}
                          </Cell>
                          <Cell className="text-xs">
                            {item.lesson_result ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => toggleActivityExpanded(item.job_id)}
                              >
                                {isActivityExpanded ? 'Hide' : 'View'}
                              </Button>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </Cell>
                          <Cell className="text-xs">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => toggleExpanded(item.job_id)}
                            >
                              {isExpanded ? 'Hide' : 'View'}
                            </Button>
                          </Cell>
                        </Row>
                        {isExpanded && (
                          <Row>
                            <Cell colSpan={9}>
                              <div className="p-4 bg-slate-50 rounded-md space-y-3 text-xs text-slate-800">
                                {item.status === 'failed' && item.error && (
                                  <div>
                                    <div className="font-semibold mb-1 text-red-700">Error:</div>
                                    <div className="whitespace-pre-wrap text-red-800">
                                      {item.error}
                                    </div>
                                  </div>
                                )}
                                <div className="space-y-2">
                                  {loadingAudioJobId === item.job_id ? (
                                    <span className="text-slate-600 text-sm">Loading…</span>
                                  ) : playErrorJobId === item.job_id ? (
                                    <span className="text-red-600 text-sm">{playError}</span>
                                  ) : loadedJobId === item.job_id ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handlePlaySpeech(item.job_id)}
                                        disabled={playingJobId === item.job_id}
                                        className="p-2 rounded-md bg-slate-200 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700"
                                        aria-label="Play"
                                      >
                                        <Play className="w-4 h-4" fill="currentColor" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (playingJobId === item.job_id && audioRef.current) {
                                            audioRef.current.pause()
                                            setPlayingJobId(null)
                                            setLoadingAudioJobId(null)
                                          }
                                        }}
                                        disabled={playingJobId !== item.job_id}
                                        className="p-2 rounded-md bg-slate-200 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700"
                                        aria-label="Pause"
                                      >
                                        <Pause className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleStop}
                                        className="p-2 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700"
                                        aria-label="Stop"
                                      >
                                        <Square className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleShowFilename(item.job_id)}
                                        disabled={loadingFilenameJobId === item.job_id}
                                        className="p-2 rounded-md bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700"
                                        aria-label="Show file name in Supabase"
                                        title="Show file name in Supabase"
                                      >
                                        <FolderOpen className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDownload(item.job_id)}
                                        disabled={downloadingJobId === item.job_id}
                                        className="p-2 rounded-md bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700"
                                        aria-label="Download audio"
                                        title="Download audio"
                                      >
                                        <Download className="w-4 h-4" />
                                      </button>
                                      <div className="flex items-center gap-1 shrink-0" title="Volume">
                                        <Volume2 className="w-4 h-4 text-slate-600" />
                                        <input
                                          type="range"
                                          min={0}
                                          max={100}
                                          value={volume}
                                          onChange={(e) => setVolume(Number(e.target.value))}
                                          className="w-16 h-1.5 accent-purple-500 cursor-pointer"
                                          aria-label="Volume"
                                        />
                                      </div>
                                      <span className="text-slate-600 text-sm tabular-nums shrink-0 w-9 text-right">
                                        {formatTime(audioCurrentTime)}
                                      </span>
                                      <div
                                        ref={loadedJobId === item.job_id ? timelineRef : null}
                                        role="slider"
                                        aria-label="Seek"
                                        aria-valuemin={0}
                                        aria-valuemax={audioDuration}
                                        aria-valuenow={audioCurrentTime}
                                        tabIndex={0}
                                        onClick={handleTimelineSeek}
                                        onKeyDown={(e) => {
                                          const audio = audioRef.current
                                          if (!audio?.duration) return
                                          const step = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0
                                          if (step) {
                                            e.preventDefault()
                                            const t = Math.max(0, Math.min(audio.duration, audio.currentTime + step))
                                            audio.currentTime = t
                                            setAudioCurrentTime(t)
                                            audio.play().catch(() => {})
                                            setPlayingJobId(item.job_id)
                                          }
                                        }}
                                        className="flex-1 h-2.5 bg-slate-200 rounded-full cursor-pointer overflow-hidden min-w-[60px]"
                                      >
                                        <div
                                          className="h-full bg-purple-500 rounded-full will-change-[width] transition-[width] duration-75 ease-linear"
                                          style={{
                                            width: audioDuration > 0 ? `${(audioCurrentTime / audioDuration) * 100}%` : '0%',
                                          }}
                                        >
                                        </div>
                                      </div>
                                      <span className="text-slate-600 text-sm tabular-nums shrink-0 w-9">
                                        {formatTime(audioDuration)}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => handlePlaySpeech(item.job_id)}
                                      >
                                        Play speech
                                      </Button>
                                      <button
                                        type="button"
                                        onClick={() => handleShowFilename(item.job_id)}
                                        disabled={loadingFilenameJobId === item.job_id}
                                        className="p-2 rounded-md bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700"
                                        aria-label="Show file name in Supabase"
                                        title="Show file name in Supabase"
                                      >
                                        <FolderOpen className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDownload(item.job_id)}
                                        disabled={downloadingJobId === item.job_id}
                                        className="p-2 rounded-md bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700"
                                        aria-label="Download audio"
                                        title="Download audio"
                                      >
                                        <Download className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                  {(shownFilename?.jobId === item.job_id || loadingFilenameJobId === item.job_id) && (
                                    <div className="text-slate-600 text-sm font-mono bg-slate-100 px-2 py-1 rounded">
                                      {loadingFilenameJobId === item.job_id ? 'Loading…' : (shownFilename?.jobId === item.job_id ? shownFilename.filename : '')}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div className="font-semibold mb-1">Transcript</div>
                                  <div className="whitespace-pre-wrap">
                                    {item.transcript || '(empty)'}
                                  </div>
                                </div>
                                {integrity && (
                                  <div className="space-y-1">
                                    <div className="font-semibold mb-1">AI Integrity</div>
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="text-xs">
                                        <span className="font-semibold">Flagged:</span>{' '}
                                        {flagged ? (
                                          <span className="text-red-700 font-semibold">Yes</span>
                                        ) : (
                                          <span className="text-slate-600">No</span>
                                        )}
                                      </span>
                                      <span className="text-xs">
                                        <span className="font-semibold">Risk score:</span>{' '}
                                        {typeof integrity.risk_score === 'number'
                                          ? integrity.risk_score
                                          : '—'}
                                      </span>
                                    </div>
                                    {integrity.signals && (
                                      <div className="text-xs text-slate-700">
                                        <div className="font-semibold">Signals:</div>
                                        <ul className="list-disc list-inside space-y-0.5">
                                          {typeof integrity.signals.robotic_cues === 'number' && (
                                            <li>
                                              Robotic cues: {integrity.signals.robotic_cues}
                                            </li>
                                          )}
                                          {typeof integrity.signals.level_mismatch === 'number' && (
                                            <li>
                                              Level mismatch: {integrity.signals.level_mismatch}
                                            </li>
                                          )}
                                          {typeof integrity.signals.off_syllabus_vocab === 'number' && (
                                            <li>
                                              Off‑syllabus vocabulary:{' '}
                                              {integrity.signals.off_syllabus_vocab}
                                            </li>
                                          )}
                                        </ul>
                                      </div>
                                    )}
                                    {flagged && integrity.message && (
                                      <div className="text-xs text-red-700 mt-1">
                                        {integrity.message}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </Cell>
                          </Row>
                        )}
                        {isActivityExpanded && (
                          <Row>
                            <Cell colSpan={9}>
                              <div className="p-4 bg-slate-50 rounded-md space-y-3 text-xs text-slate-800">
                                <div>
                                  <div className="font-semibold mb-1">Activity (lesson result)</div>
                                  {item.lesson_result ? (
                                    <div className="space-y-1 text-xs text-slate-700">
                                      <div>
                                        <span className="font-semibold">Type:</span>{' '}
                                        {item.lesson_result.activity_type || '—'}
                                      </div>
                                      <div>
                                        <span className="font-semibold">Order:</span>{' '}
                                        {typeof item.lesson_result.activity_order === 'number'
                                          ? item.lesson_result.activity_order
                                          : '—'}
                                      </div>
                                      <div>
                                        <span className="font-semibold">Completed at:</span>{' '}
                                        {item.lesson_result.completed_at
                                          ? formatDate(item.lesson_result.completed_at)
                                          : '—'}
                                      </div>
                                      <div>
                                        <span className="font-semibold">Score:</span>{' '}
                                        {typeof item.lesson_result.score === 'number'
                                          ? `${item.lesson_result.score}/${item.lesson_result.max_score ?? '—'}`
                                          : '—'}
                                      </div>
                                      {item.lesson_result.answers && (
                                        <div className="mt-1">
                                          <div className="font-semibold">Answer text</div>
                                          <div className="whitespace-pre-wrap text-slate-800">
                                            {typeof item.lesson_result.answers.transcript === 'string'
                                              ? item.lesson_result.answers.transcript
                                              : typeof item.lesson_result.answers.text === 'string'
                                              ? item.lesson_result.answers.text
                                              : JSON.stringify(item.lesson_result.answers, null, 2)}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-slate-700">
                                      No entries in lesson_activity_results for this user + lesson
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Cell>
                          </Row>
                        )}
                      </React.Fragment>
                    )
                  })}
                </Body>
              </Table>
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  )
}

