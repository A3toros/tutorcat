'use client'

import React, { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminProtectedRoute from '@/components/auth/AdminProtectedRoute'
import { Button, Card } from '@/components/ui'
import { useNotification } from '@/contexts/NotificationContext'
import {
  SAMPLE_SUPERHERO_BUNDLE,
  classifyHeroAlignmentRequest,
  generateSuperheroImageRequest,
  type ClassifyHeroAlignmentResult,
  type GenerateSuperheroImageResult,
  type SuperheroAiBundle,
  resolveSuperheroImageDisplayUrl,
} from '@/lib/superheroAi'
import { compressImageSourceToDataUrl, fileToImage } from '@/lib/compressImageToDataUrl'
import { downloadDataUrl } from '@/lib/downloadDataUrl'

const DEFAULT_DESCRIPTION = SAMPLE_SUPERHERO_BUNDLE.character_description

export default function AdminSuperheroAiTestPage() {
  const router = useRouter()
  const { showNotification } = useNotification()

  const [description, setDescription] = useState(DEFAULT_DESCRIPTION)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [classifyLoading, setClassifyLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  const [classifyResult, setClassifyResult] = useState<ClassifyHeroAlignmentResult | null>(null)
  const [imageResult, setImageResult] = useState<GenerateSuperheroImageResult | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const buildBundle = useCallback((): SuperheroAiBundle => {
    const lines = description
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    return {
      ...SAMPLE_SUPERHERO_BUNDLE,
      profile_sentences: lines,
      profile_slots: lines.map((sentence) => ({
        sentence,
        word: '',
      })),
      character_description: lines.join('\n'),
      selfie_data_url: selfiePreview,
    }
  }, [description, selfiePreview])

  const handleSelfieFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const img = await fileToImage(file)
      const dataUrl = await compressImageSourceToDataUrl(img)
      setSelfiePreview(dataUrl)
    } catch {
      showNotification('Could not load that image.', 'error')
    }
  }

  const runClassify = async () => {
    setClassifyLoading(true)
    setLastError(null)
    const res = await classifyHeroAlignmentRequest({ bundle: buildBundle(), useAdminApi: true })
    setClassifyLoading(false)
    if (!res.success || !res.data) {
      setLastError(res.error || 'Classification failed')
      showNotification(res.error || 'Classification failed', 'error')
      return
    }
    setClassifyResult(res.data)
    showNotification('Alignment result ready', 'success')
  }

  const runImage = async () => {
    setImageLoading(true)
    setLastError(null)
    const res = await generateSuperheroImageRequest({ bundle: buildBundle(), useAdminApi: true })
    setImageLoading(false)
    if (!res.success || !res.data) {
      setLastError(res.error || 'Image generation failed')
      showNotification(res.error || 'Image generation failed', 'error')
      return
    }
    setImageResult(res.data)
    showNotification('Image generated', 'success')
  }

  return (
    <AdminProtectedRoute>
      <main className="min-h-screen bg-slate-900 p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => router.push('/admin/dashboard')}>
              ← Dashboard
            </Button>
          </div>

          <Card className="p-5 bg-gradient-to-br from-white to-indigo-50 border-indigo-200">
            <h1 className="text-2xl font-bold text-slate-900">Lesson 4 — Superhero AI test</h1>
            <p className="text-sm text-slate-600 mt-2">
              Calls <code className="text-xs bg-white px-1 rounded">classify-hero-alignment</code> and{' '}
              <code className="text-xs bg-white px-1 rounded">generate-superhero-image</code> with{' '}
              <code className="text-xs bg-white px-1 rounded">OPENAI_API_KEY</code>. Uses admin auth; does not
              write student progress.
            </p>
          </Card>

          <Card className="p-5 space-y-4">
            <div>
              <label htmlFor="hero-desc" className="block text-sm font-medium text-slate-700 mb-1">
                Character description (one sentence per line)
              </label>
              <textarea
                id="hero-desc"
                rows={6}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => setDescription(DEFAULT_DESCRIPTION)}
              >
                Reset sample
              </Button>
            </div>

            <p className="text-sm text-slate-600">
              The Magic Hat will generate your superhero portrait based on your choices.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Hero face photo (required for image test)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  void handleSelfieFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              {selfiePreview && (
                <div className="mt-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selfiePreview}
                    alt="Selfie preview"
                    className="max-h-32 rounded border"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    onClick={() => setSelfiePreview(null)}
                  >
                    Remove selfie
                  </Button>
                </div>
              )}
            </div>

            {lastError && <p className="text-sm text-red-700">{lastError}</p>}

            <div className="flex flex-wrap gap-2">
              <Button onClick={runClassify} disabled={classifyLoading || imageLoading}>
                {classifyLoading ? 'Classifying…' : 'Test alignment'}
              </Button>
              <Button onClick={runImage} disabled={classifyLoading || imageLoading || !selfiePreview}>
                {imageLoading ? 'Generating image…' : 'Test image gen'}
              </Button>
            </div>
          </Card>

          {classifyResult && (
            <Card className="p-5">
              <h2 className="font-semibold text-slate-800 mb-2">Alignment result</h2>
              <p className="text-sm capitalize">
                <strong>{classifyResult.alignment.replace('-', ' ')}</strong> (
                {Math.round(classifyResult.confidence * 100)}%)
              </p>
              <ul className="list-disc pl-5 text-sm text-slate-700 mt-2">
                {classifyResult.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              {classifyResult.traits.length > 0 && (
                <p className="text-xs text-slate-600 mt-2">Traits: {classifyResult.traits.join(', ')}</p>
              )}
              {classifyResult.prompt_used && (
                <details className="mt-3">
                  <summary className="text-xs text-slate-500 cursor-pointer">Prompt sent</summary>
                  <pre className="text-xs mt-2 whitespace-pre-wrap bg-slate-50 p-2 rounded border overflow-auto max-h-48">
                    {classifyResult.prompt_used}
                  </pre>
                </details>
              )}
            </Card>
          )}

          {imageResult && (
            <Card className="p-5">
              <h2 className="font-semibold text-slate-800 mb-2">Image result</h2>
              <p className="text-xs text-slate-600 mb-2">
                Model: {imageResult.model}
                {imageResult.generation_method ? ` · ${imageResult.generation_method}` : ''}
              </p>
              {resolveSuperheroImageDisplayUrl(imageResult) && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={resolveSuperheroImageDisplayUrl(imageResult)!}
                  alt="Generated test hero"
                  className="max-h-80 mx-auto rounded border"
                />
              )}
              {resolveSuperheroImageDisplayUrl(imageResult) && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    downloadDataUrl(
                      resolveSuperheroImageDisplayUrl(imageResult)!,
                      'superhero-test.png'
                    )
                  }
                >
                  Save photo
                </Button>
              )}
              {imageResult.why_chosen && (
                <p className="text-sm text-slate-700 mt-3 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                  {imageResult.why_chosen}
                </p>
              )}
              {imageResult.facial_features && (
                <p className="text-xs text-slate-600 mt-2">
                  Facial features preserved: {imageResult.facial_features}
                </p>
              )}
              <details className="mt-3">
                <summary className="text-xs text-slate-500 cursor-pointer">Prompt sent</summary>
                <pre className="text-xs mt-2 whitespace-pre-wrap bg-slate-50 p-2 rounded border overflow-auto max-h-48">
                  {imageResult.prompt_used}
                </pre>
              </details>
            </Card>
          )}
        </div>
      </main>
    </AdminProtectedRoute>
  )
}
