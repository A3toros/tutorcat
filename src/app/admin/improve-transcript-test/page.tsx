'use client'

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, Button, Input } from '@/components/ui'
import { useNotification } from '@/contexts/NotificationContext'
import { adminApiRequest } from '@/utils/adminApi'

type PromptItem = { id: string; text: string }

const A1_PROMPTS: PromptItem[] = [
  { id: 'a1-1', text: 'Tell me about your family.' },
  { id: 'a1-2', text: 'What is your favorite food? Why?' },
  { id: 'a1-3', text: 'Describe your daily routine.' },
  { id: 'a1-4', text: 'What do you do on weekends?' },
  { id: 'a1-5', text: 'Describe your home or your room.' },
  { id: 'a1-6', text: 'What is your favorite place in your city?' },
  { id: 'a1-7', text: 'What do you like to do after school/work?' },
  { id: 'a1-8', text: 'Tell me about your best friend.' },
]

function pickRandomPrompts(count: number): PromptItem[] {
  const copy = [...A1_PROMPTS]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, Math.min(count, copy.length))
}

function countWords(text: string): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length
}

export default function ImproveTranscriptTestPage() {
  const router = useRouter()
  const { showNotification } = useNotification()

  const prompts = useMemo(() => pickRandomPrompts(3), [])

  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(prompts.map((p) => [p.id, '']))
  )
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string>('')

  const segmentCount = prompts.length
  const level = 'A1'
  const maxWords = 40

  const handleGenerate = async () => {
    try {
      setIsLoading(true)
      setResult('')

      console.log('[improve-transcript-test] Generate clicked', {
        level,
        maxWords,
        segmentCount,
        prompts: prompts.map((p) => ({ id: p.id, text: p.text })),
      })

      const missing = prompts.filter((p) => !(answers[p.id] && answers[p.id].trim()))
      if (missing.length > 0) {
        console.log('[improve-transcript-test] Missing answers', { missing: missing.map((m) => m.id) })
        showNotification(`Please paste transcripts for all ${segmentCount} prompts.`, 'error')
        return
      }

      const structuredText = prompts
        .map((p, idx) => `[Prompt ${idx + 1}] ${p.text}\n[Answer ${idx + 1}] ${answers[p.id].trim()}`)
        .join('\n\n')

      const payload = {
        text: structuredText,
        level,
        maxWords,
        segmentCount,
      }

      console.log('[improve-transcript-test] Request payload', {
        level: payload.level,
        maxWords: payload.maxWords,
        segmentCount: payload.segmentCount,
        textLength: payload.text.length,
        textPreview: payload.text.slice(0, 400),
      })

      const response = await adminApiRequest('/.netlify/functions/improve-transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const text = await response.text()
      console.log('[improve-transcript-test] Response received', {
        ok: response.ok,
        status: response.status,
        textPreview: text.slice(0, 400),
      })
      let json: any
      try {
        json = JSON.parse(text)
      } catch {
        console.log('[improve-transcript-test] Response JSON parse failed')
        throw new Error(text || `HTTP ${response.status}`)
      }

      console.log('[improve-transcript-test] Parsed response JSON', json)

      if (!response.ok || !json?.success) {
        throw new Error(json?.error || `HTTP ${response.status}`)
      }

      const improved = String(json.improved_text || '')
      console.log('[improve-transcript-test] Success', {
        improvedLength: improved.length,
        improvedWordCount: countWords(improved),
        improvedPreview: improved.slice(0, 200),
      })
      setResult(improved)
    } catch (e: any) {
      console.error(e)
      showNotification(`Failed to generate improved transcript: ${e?.message || 'Unknown error'}`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" onClick={() => router.push('/admin/transcripts')}>
            ← Back to Transcripts
          </Button>
          <div className="text-sm text-slate-600">
            Level: <span className="font-semibold">{level}</span> • Target: 20±20 words • Max: {maxWords}
          </div>
        </div>

        <Card className="border-purple-200 shadow-lg bg-white">
          <Card.Header>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Test: Combined improved transcript</h1>
              <p className="text-slate-600 text-sm">
                Paste transcripts for 3 random A1 prompts. Generates one short combined paragraph using existing backend.
              </p>
            </div>
          </Card.Header>
          <Card.Body>
            <div className="space-y-4">
              {prompts.map((p, idx) => (
                <div key={p.id} className="space-y-2">
                  <div className="text-sm font-semibold text-slate-800">
                    Prompt {idx + 1}: <span className="font-normal">{p.text}</span>
                  </div>
                  <textarea
                    value={answers[p.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="w-full min-h-[90px] rounded-md border border-slate-200 p-3 text-sm"
                    placeholder="Paste the student transcript here..."
                  />
                </div>
              ))}

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleGenerate} disabled={isLoading}>
                  {isLoading ? 'Generating…' : 'Generate improved transcript'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAnswers(Object.fromEntries(prompts.map((p) => [p.id, ''])))
                    setResult('')
                  }}
                  disabled={isLoading}
                >
                  Clear
                </Button>
              </div>

              <div className="pt-2">
                <div className="text-sm font-semibold text-slate-800 mb-1">Result</div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap">
                  {result || '—'}
                </div>
                {result ? (
                  <div className="mt-2 text-xs text-slate-600">
                    Word count: <span className="font-semibold">{countWords(result)}</span> (expected 0–40 for A1/A2)
                  </div>
                ) : null}
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  )
}

