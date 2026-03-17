'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Table, Header, Body, Row, Head, Cell, Button, Select, Input } from '@/components/ui'

type RecordingItem = {
  filename: string
  baseKey: string
  status?: string | null
  promptId?: string | null
  userId?: string | null
  createdAt?: string | null
  baseline?: {
    mode: 'reading' | 'speaking'
    confidence: number
    spokenPct: number
  } | null
}

type Stats = {
  reading: number
  speaking: number
  not_sure: number
  ai: number
  google_translate: number
  prediction?: {
    mode: 'reading' | 'speaking' | 'not_sure' | string
    confidence: number
    votes: number
    suspectRate: number
  }
  baseline?: {
    mode: 'reading' | 'speaking'
    confidence: number
    spokenPct: number
  } | null
  ml?: {
    mode: 'reading' | 'speaking'
    confidence: number
    spokenPct: number
  } | null
}

type TranscriptPayload = {
  transcript: string
  improvedTranscript: string | null
  integrity: any
}

function getOrCreateSessionId(): string {
  try {
    const key = 'public_recordings_session_id'
    const existing = window.localStorage.getItem(key)
    if (existing) return existing
    const id = crypto.randomUUID()
    window.localStorage.setItem(key, id)
    return id
  } catch {
    return ''
  }
}

function basenameNoExt(filename: string): string {
  return filename.replace(/\.[^.]+$/, '')
}

function formatStatus(status: string | null | undefined): string | null {
  if (!status) return null
  const s = status.trim().toLowerCase()
  if (!s) return null
  if (s === 'completed') return 'ok'
  if (s === 'processing') return 'proc'
  if (s === 'analyzing') return 'anlz'
  if (s === 'failed') return 'fail'
  return s
}

export default function PublicRecordingsPage() {
  const [items, setItems] = useState<RecordingItem[]>([])
  const [totalAudio, setTotalAudio] = useState<number | null>(null)
  const [stats, setStats] = useState<Record<string, Stats>>({})
  const [sessionVotes, setSessionVotes] = useState<
    Record<string, { mode?: string; suspect?: { ai?: boolean; google_translate?: boolean } }>
  >({})
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<25 | 50 | 100>(25)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const [openTranscriptFor, setOpenTranscriptFor] = useState<Record<string, boolean>>({})
  const [transcriptsByBaseKey, setTranscriptsByBaseKey] = useState<Record<string, TranscriptPayload | undefined>>({})
  const [loadingTranscriptFor, setLoadingTranscriptFor] = useState<string | null>(null)

  const [openPlayerFilename, setOpenPlayerFilename] = useState<string | null>(null)
  const [audioUrlByFilename, setAudioUrlByFilename] = useState<Record<string, string | undefined>>({})
  const [loadingAudioFilename, setLoadingAudioFilename] = useState<string | null>(null)

  const sessionId = useMemo(() => (typeof window === 'undefined' ? '' : getOrCreateSessionId()), [])

  function changeLimit(next: 25 | 50 | 100) {
    // Immediate UI feedback (effect will perform the fetch).
    setLoading(true)
    setPage(1)
    setLimit(next)
  }

  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.filename.toLowerCase().includes(q) || it.baseKey.toLowerCase().includes(q))
  }, [items, filter])

  const baseKeysForPage = useMemo(() => {
    return Array.from(new Set(filteredItems.map((i) => i.baseKey)))
  }, [filteredItems])

  async function loadRecordings(nextPage: number, nextLimit: number) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/.netlify/functions/public-list-recordings?page=${encodeURIComponent(nextPage)}&limit=${encodeURIComponent(nextLimit)}`,
        { method: 'GET' }
      )
      const data = await res.json()
      if (!data?.success) throw new Error(data?.error || 'Failed to load recordings')
      setItems(Array.isArray(data.items) ? data.items : [])
      setHasMore(!!data.hasMore)
      setTotalAudio(typeof data.totalAudio === 'number' ? data.totalAudio : null)
    } catch (e) {
      setError((e as Error).message)
      setItems([])
      setHasMore(false)
      setTotalAudio(null)
    } finally {
      setLoading(false)
    }
  }

  async function refreshStats(keys: string[]) {
    if (keys.length === 0) return
    try {
      const res = await fetch(
        `/.netlify/functions/public-get-recording-stats?baseKeys=${encodeURIComponent(keys.join(','))}&sessionId=${encodeURIComponent(sessionId)}`,
        { method: 'GET' }
      )
      const data = await res.json()
      if (!data?.success) return
      setStats((prev) => ({ ...prev, ...(data.stats || {}) }))
      if (data.sessionVotes && typeof data.sessionVotes === 'object') {
        setSessionVotes(data.sessionVotes)
      }
    } catch {
      // ignore
    }
  }

  async function loadTranscript(baseKey: string) {
    if (transcriptsByBaseKey[baseKey]) return
    setLoadingTranscriptFor(baseKey)
    try {
      const res = await fetch(
        `/.netlify/functions/public-get-recording-transcript?baseKey=${encodeURIComponent(baseKey)}`,
        { method: 'GET' }
      )
      const data = await res.json()
      if (!data?.success) return
      setTranscriptsByBaseKey((prev) => ({
        ...prev,
        [baseKey]: {
          transcript: String(data.transcript || ''),
          improvedTranscript: typeof data.improvedTranscript === 'string' ? data.improvedTranscript : null,
          integrity: data.integrity ?? null,
        },
      }))
    } catch {
      // ignore
    } finally {
      setLoadingTranscriptFor(null)
    }
  }

  async function track(baseKey: string, group: 'mode' | 'suspect', choice: string) {
    // optimistic update
    setStats((prev) => {
      const current: Stats = prev[baseKey] || { reading: 0, speaking: 0, not_sure: 0, ai: 0, google_translate: 0 }
      const next = { ...current }
      if (group === 'mode') {
        if (choice === 'reading') next.reading += 1
        if (choice === 'speaking') next.speaking += 1
        if (choice === 'not_sure') next.not_sure += 1
      } else {
        if (choice === 'ai') next.ai += 1
        if (choice === 'google_translate') next.google_translate += 1
      }
      return { ...prev, [baseKey]: next }
    })

    try {
      await fetch('/.netlify/functions/public-track-recording', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseKey, group, choice, sessionId }),
      })
      refreshStats([baseKey])
    } catch {
      // ignore
    }
  }

  async function ensureWhisperLogIngested(baseKey: string) {
    // best-effort; not required for UI
    try {
      await fetch('/.netlify/functions/public-sync-whisper-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseKey }),
      })
    } catch {
      // ignore
    }
  }

  async function togglePlayer(filename: string) {
    if (openPlayerFilename === filename) {
      setOpenPlayerFilename(null)
      return
    }

    // If we already have a signed URL cached, open immediately.
    if (audioUrlByFilename[filename]) {
      setOpenPlayerFilename(filename)
      return
    }

    setLoadingAudioFilename(filename)
    try {
      const res = await fetch(
        `/.netlify/functions/public-get-recording-audio-url?filename=${encodeURIComponent(filename)}`,
        { method: 'GET' }
      )
      const data = await res.json()
      if (!data?.success || !data?.url) throw new Error(data?.error || 'Failed to get audio URL')
      setAudioUrlByFilename((prev) => ({ ...prev, [filename]: data.url }))
      setOpenPlayerFilename(filename)
    } catch {
      setOpenPlayerFilename(null)
    } finally {
      setLoadingAudioFilename(null)
    }
  }

  useEffect(() => {
    loadRecordings(page, limit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit])

  useEffect(() => {
    refreshStats(baseKeysForPage)
    // best-effort whisper log ingestion for visible items
    baseKeysForPage.slice(0, 50).forEach((k) => ensureWhisperLogIngested(k))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKeysForPage.join(',')])

  useEffect(() => {
    if (baseKeysForPage.length === 0) return
    const id = window.setInterval(() => refreshStats(baseKeysForPage), 10000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKeysForPage.join(',')])

  return (
    <main className="container mx-auto px-4 py-10 max-w-7xl">
      <Card className="border-0 shadow-xl">
        <Card.Body className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Recordings review</h1>
              <p className="text-sm text-neutral-600">
                <span className="font-medium">Mode:</span> choose exactly one (Reading / Speaking / Not sure).{' '}
                <span className="font-medium">Suspect:</span> click one or both only if you suspect cheating (AI / Translate).
              </p>
              {typeof totalAudio === 'number' ? (
                <p className="text-xs text-neutral-500 mt-1">Total audio recordings in Supabase: {totalAudio}</p>
              ) : null}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="w-full sm:w-60">
                <Input
                  label="Filter"
                  placeholder="Filename or base key…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  fullWidth
                />
              </div>
              <div className="w-full sm:w-48">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Per page</label>
                <div className="flex items-center gap-2">
                  <Select
                    value={String(limit)}
                    disabled={loading}
                    onChange={(e) => changeLimit(Number(e.target.value) as any)}
                  >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  </Select>
                  {loading ? <span className="text-xs text-neutral-500">Loading…</span> : null}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!hasMore || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>

          {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

          <div className="mt-6">
            <Table className="bg-white rounded-xl border border-neutral-200">
              <Header>
                <Row>
                  <Head>Item</Head>
                  <Head>Audio</Head>
                  <Head>Mode</Head>
                  <Head>Suspect</Head>
                  <Head>Votes</Head>
                </Row>
              </Header>
              <Body>
                {filteredItems.map((it) => {
                  const s = stats[it.baseKey] || { reading: 0, speaking: 0, not_sure: 0, ai: 0, google_translate: 0 }
                  const pred = s.prediction
                  const baseline = it.baseline ?? s.baseline
                  const ml = s.ml
                  const transcriptOpen = !!openTranscriptFor[it.baseKey]
                  const transcriptPayload = transcriptsByBaseKey[it.baseKey]
                  const statusShort = formatStatus(it.status || null)
                  const totalVotes = (s.reading || 0) + (s.speaking || 0) + (s.not_sure || 0) + (s.ai || 0) + (s.google_translate || 0)
                  const myVote = sessionVotes[it.baseKey]
                  const modeLocked = !!myVote?.mode
                  const suspectAiLocked = !!myVote?.suspect?.ai
                  const suspectTranslateLocked = !!myVote?.suspect?.google_translate
                  return (
                    <React.Fragment key={it.filename}>
                      <Row>
                        <Cell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{it.filename}</div>
                            {statusShort ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
                                {statusShort}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-neutral-600 flex flex-wrap gap-x-3 gap-y-1">
                            <button
                              type="button"
                              className="text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
                              onClick={() => {
                                setOpenTranscriptFor((prev) => ({ ...prev, [it.baseKey]: !prev[it.baseKey] }))
                                if (!transcriptPayload) loadTranscript(it.baseKey)
                              }}
                            >
                              Transcript
                            </button>
                          </div>
                        </Cell>
                        <Cell className="whitespace-nowrap">
                          <div className="flex flex-col gap-2 items-start">
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={loadingAudioFilename === it.filename}
                              onClick={() => togglePlayer(it.filename)}
                            >
                              {openPlayerFilename === it.filename ? 'Hide' : 'Play'}
                            </Button>
                            {loadingTranscriptFor === it.baseKey ? (
                              <div className="text-[11px] text-neutral-500">Loading…</div>
                            ) : null}
                          </div>
                        </Cell>
                        <Cell>
                          {modeLocked ? (
                            <div className="text-xs text-neutral-600">
                              Mode: <span className="font-semibold">{myVote?.mode}</span>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" onClick={() => track(it.baseKey, 'mode', 'reading')}>Reading</Button>
                              <Button size="sm" onClick={() => track(it.baseKey, 'mode', 'speaking')}>Speaking</Button>
                              <Button size="sm" variant="secondary" onClick={() => track(it.baseKey, 'mode', 'not_sure')}>Not sure</Button>
                            </div>
                          )}
                        </Cell>
                        <Cell>
                          <div className="flex flex-wrap gap-2 items-center">
                            {!suspectAiLocked ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const ok = window.confirm('Are you sure you suspect the student used AI?')
                                  if (ok) track(it.baseKey, 'suspect', 'ai')
                                }}
                              >
                                AI
                              </Button>
                            ) : (
                              <span className="text-xs text-neutral-600">AI ✓</span>
                            )}
                            {!suspectTranslateLocked ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const ok = window.confirm('Are you sure you suspect the student used Google Translate?')
                                  if (ok) track(it.baseKey, 'suspect', 'google_translate')
                                }}
                              >
                                Translate
                              </Button>
                            ) : (
                              <span className="text-xs text-neutral-600">Translate ✓</span>
                            )}
                            {suspectAiLocked || suspectTranslateLocked ? (
                              <span className="text-[11px] text-neutral-500">Suspect saved</span>
                            ) : null}
                          </div>
                        </Cell>
                        <Cell className="whitespace-nowrap">
                          <div className="text-xs text-neutral-700 space-y-1">
                            {pred ? (
                              <div>
                                <span className="font-semibold">{String(pred.mode)}</span>{' '}
                                <span className="text-neutral-500">
                                  ({Math.round((pred.confidence || 0) * 100)}% · {pred.votes} vote{pred.votes === 1 ? '' : 's'})
                                </span>
                              </div>
                            ) : null}
                            {baseline ? (
                              <div
                                className="text-neutral-600"
                                title={`Baseline from features. spoken=${baseline.spokenPct}% · confidence=${Math.round(
                                  (baseline.confidence || 0) * 100
                                )}%`}
                              >
                                Base: <span className="font-semibold">{baseline.mode}</span>{' '}
                                <span className="text-neutral-500">(spoken {baseline.spokenPct}%)</span>
                              </div>
                            ) : null}
                            {ml ? (
                              <div
                                className="text-neutral-800"
                                title={`Live-trained model. spoken=${ml.spokenPct}% · confidence=${Math.round((ml.confidence || 0) * 100)}%`}
                              >
                                ML: <span className="font-semibold">{ml.mode}</span>{' '}
                                <span className="text-neutral-500">(spoken {ml.spokenPct}%)</span>
                              </div>
                            ) : null}
                            {totalVotes === 0 ? (
                              <div className="text-neutral-500">No votes yet</div>
                            ) : (
                              <>
                                <div>
                                  <span title="Teacher votes: Reading">R</span> <span className="font-semibold">{s.reading}</span> ·{' '}
                                  <span title="Teacher votes: Speaking">S</span> <span className="font-semibold">{s.speaking}</span> ·{' '}
                                  <span title="Teacher votes: Not sure">?</span> <span className="font-semibold">{s.not_sure}</span>
                                </div>
                                <div>
                                  <span title="Teacher votes: Suspect AI">AI</span> <span className="font-semibold">{s.ai}</span> ·{' '}
                                  <span title="Teacher votes: Suspect translation">T</span> <span className="font-semibold">{s.google_translate}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </Cell>
                      </Row>

                      {openPlayerFilename === it.filename ? (
                        <Row>
                          <Cell colSpan={5}>
                            <audio
                              key={`${it.filename}:player`}
                              controls
                              autoPlay
                              className="w-full"
                              src={audioUrlByFilename[it.filename]}
                            />
                          </Cell>
                        </Row>
                      ) : null}

                      {transcriptOpen ? (
                        <Row>
                          <Cell colSpan={5}>
                            <div className="text-sm text-neutral-800 space-y-3">
                              <div>
                                <div className="text-xs font-semibold text-neutral-600 mb-1">Transcript</div>
                                <div className="whitespace-pre-wrap">{transcriptPayload?.transcript || '—'}</div>
                              </div>
                              {transcriptPayload?.integrity ? (
                                <div className="text-xs text-neutral-600">
                                  AI risk: <span className="font-medium">{String(transcriptPayload.integrity?.risk_score ?? '—')}</span>
                                  {transcriptPayload.integrity?.flagged === true ? (
                                    <span className="ml-2 font-semibold text-red-600">FLAGGED</span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </Cell>
                        </Row>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </Body>
            </Table>

            {loading && <div className="mt-4 text-sm text-neutral-600">Loading…</div>}
            {!loading && filteredItems.length === 0 && (
              <div className="mt-4 text-sm text-neutral-600">No recordings found for this page.</div>
            )}
          </div>
        </Card.Body>
      </Card>
    </main>
  )
}

