'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import {
  buildSuperheroAiBundleFromResults,
  generateSuperheroImageRequest,
  hasSuperheroSelfie,
} from '@/lib/superheroAi'
import SuperheroSelfiePicker from './SuperheroSelfiePicker'
import { downloadDataUrl } from '@/lib/downloadDataUrl'

const DEFAULT_IMAGE_DESCRIPTION =
  'The Magic Hat will generate your superhero portrait based on your choices.'

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

  const [selfie, setSelfie] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pollStatus, setPollStatus] = useState<'processing' | 'generating' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [whyChosen, setWhyChosen] = useState<string | null>(null)
  const [promptUsed, setPromptUsed] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)

  const hasSelfie = hasSuperheroSelfie({ ...bundle, selfie_data_url: selfie })

  const handleGenerate = async () => {
    if (!selfie) {
      setError('Add your photo first, then tap Generate my hero.')
      return
    }
    setLoading(true)
    setPollStatus('processing')
    setError(null)
    const adminTest = isAdminLessonTestMode()
    const requestBundle = { ...bundle, selfie_data_url: selfie }
    const res = await generateSuperheroImageRequest(
      adminTest
        ? { bundle: requestBundle, useAdminApi: true, onPollStatus: (s) => setPollStatus(s) }
        : { studentLessonId: lesson.id, selfie_data_url: selfie, onPollStatus: (s) => setPollStatus(s) }
    )
    setLoading(false)
    setPollStatus(null)
    if (!res.success || !res.data) {
      setError(
        res.error ||
          (!hasProfile
            ? 'Complete the Powers & weakness sentences activity first.'
            : 'Could not generate image. Try again.')
      )
      return
    }
    setImageDataUrl(res.data.image_data_url)
    setWhyChosen(res.data.why_chosen ?? null)
    setPromptUsed(res.data.prompt_used)
    setModel(res.data.model)
  }

  const handleContinue = () => {
    if (!imageDataUrl || !selfie) return
    onComplete({
      score: 1,
      maxScore: 1,
      attempts: 1,
      answers: {
        status: 'complete',
        selfie_data_url: selfie,
        image_data_url: imageDataUrl,
        image_url: null,
        provider: model,
        prompt_used: promptUsed,
        why_chosen: whyChosen,
        skipped: false,
        savedAt: new Date().toISOString(),
      },
    })
  }

  const canGenerate = hasProfile && hasSelfie && !loading

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

      <SuperheroSelfiePicker photo={selfie} onPhotoChange={setSelfie} disabled={loading} />

      <div className="min-h-48 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center mb-4 overflow-hidden">
        {loading ? (
          <p className="text-slate-600 text-sm px-4 text-center animate-pulse">
            {pollStatus === 'generating'
              ? 'Drawing your superhero portrait… almost done.'
              : 'Starting your portrait… this can take up to a minute.'}
          </p>
        ) : imageDataUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageDataUrl}
            alt="Generated superhero"
            className="max-h-64 w-full object-contain"
          />
        ) : (
          <p className="text-slate-400 text-sm px-4 text-center">Your superhero portrait will appear here.</p>
        )}
      </div>

      {whyChosen && imageDataUrl && (
        <p className="text-sm text-slate-700 mb-4 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
          {whyChosen}
        </p>
      )}

      {error && <p className="text-sm text-amber-700 mb-3">{error}</p>}

      {!imageDataUrl && (
        <Button className="w-full mb-2" onClick={handleGenerate} disabled={!canGenerate}>
          {loading ? 'Generating…' : 'Generate my hero'}
        </Button>
      )}

      {imageDataUrl && (
        <>
          <Button
            className="w-full mb-2"
            variant="secondary"
            onClick={() => downloadDataUrl(imageDataUrl, 'my-superhero.png')}
            disabled={loading}
          >
            Save photo
          </Button>
          <Button className="w-full mb-2" variant="secondary" onClick={handleGenerate} disabled={loading || !selfie}>
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
