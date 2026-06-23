'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import {
  buildSuperheroAiBundleFromResults,
  generateSuperheroImageRequest,
  hasSuperheroSelfie,
} from '@/lib/superheroAi'

const DEFAULT_IMAGE_DESCRIPTION = 'Generate an original cartoon portrait of your superhero.'

function isAdminLessonTestMode(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Window & { __ADMIN_LESSON_TEST_MODE?: boolean }).__ADMIN_LESSON_TEST_MODE)
}

export default function StudentSuperheroImageGenerate({
  activity,
  lesson,
  activityResults,
  onComplete,
}: StudentActivityProps) {
  const bundle = useMemo(
    () => buildSuperheroAiBundleFromResults(activityResults ?? []),
    [activityResults]
  )
  const hasProfile = bundle.profile_sentences.length > 0
  const hasSelfie = hasSuperheroSelfie(bundle)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [promptUsed, setPromptUsed] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    const adminTest = isAdminLessonTestMode()
    const res = await generateSuperheroImageRequest(
      adminTest
        ? { bundle, useAdminApi: true }
        : { studentLessonId: lesson.id }
    )
    setLoading(false)
    if (!res.success || !res.data) {
      setError(
        res.error ||
          (!hasSelfie
            ? 'Add your hero face photo first (activity #14).'
            : !hasProfile
              ? 'Complete the Powers & weakness sentences activity first.'
              : 'Could not generate image. Try again.')
      )
      return
    }
    setImageDataUrl(res.data.image_data_url)
    setPromptUsed(res.data.prompt_used)
    setModel(res.data.model)
  }

  const handleContinue = () => {
    if (!imageDataUrl) return
    onComplete({
      score: 1,
      maxScore: 1,
      attempts: 1,
      answers: {
        status: 'complete',
        image_data_url: imageDataUrl,
        image_url: null,
        provider: model,
        prompt_used: promptUsed,
        skipped: false,
        savedAt: new Date().toISOString(),
      },
    })
  }

  const canGenerate = hasProfile && hasSelfie

  return (
    <Card className="p-4 sm:p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-slate-800 mb-2">
        {activity.title || 'What would you be like as a superhero based on your answers and appearance?'}
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        {activity.description || DEFAULT_IMAGE_DESCRIPTION}
      </p>

      {!hasProfile && !isAdminLessonTestMode() && (
        <p className="text-sm text-amber-700 mb-3">
          Finish activity #11 (Powers & weakness sentences) first.
        </p>
      )}
      {!hasSelfie && !isAdminLessonTestMode() && (
        <p className="text-sm text-amber-700 mb-3">
          Finish activity #14 (Your hero face) — take a photo or choose from gallery.
        </p>
      )}

      <div className="min-h-48 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center mb-4 overflow-hidden">
        {loading ? (
          <p className="text-slate-600 text-sm px-4 text-center animate-pulse">
            Drawing your hero… this can take 20–40 seconds.
          </p>
        ) : imageDataUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageDataUrl}
            alt="Generated superhero"
            className="max-h-64 w-full object-contain"
          />
        ) : (
          <p className="text-slate-400 text-sm px-4 text-center">Your portrait will appear here.</p>
        )}
      </div>

      {error && <p className="text-sm text-amber-700 mb-3">{error}</p>}

      {!imageDataUrl && (
        <Button className="w-full mb-2" onClick={handleGenerate} disabled={loading || !canGenerate}>
          {loading ? 'Generating…' : 'Generate my hero'}
        </Button>
      )}

      {imageDataUrl && (
        <>
          <Button className="w-full mb-2" variant="secondary" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Regenerating…' : 'Try again'}
          </Button>
          <Button className="w-full" onClick={handleContinue}>
            Continue
          </Button>
        </>
      )}
    </Card>
  )
}
