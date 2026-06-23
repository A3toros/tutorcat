'use client'

import React, { useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

/** Phase D stub — placeholder until generate-superhero-image function ships. */
export default function StudentSuperheroImageGenerate({ activity, onComplete }: StudentActivityProps) {
  const [generated, setGenerated] = useState(false)

  const handleGenerate = () => {
    setGenerated(true)
  }

  const handleContinue = () => {
    onComplete({
      score: 1,
      maxScore: 1,
      attempts: 1,
      answers: {
        status: generated ? 'stub_complete' : 'skipped',
        image_url: null,
        provider: null,
        savedAt: new Date().toISOString(),
      },
    })
  }

  return (
    <Card className="p-4 sm:p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-slate-800 mb-2">
        {activity.title || 'AI draws your character'}
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        {activity.description ||
          'Your original superhero portrait will appear here. (Coming soon — tap Generate to continue the lesson.)'}
      </p>

      <div className="h-48 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center mb-4">
        {generated ? (
          <p className="text-slate-600 text-sm px-4 text-center">
            Portrait generation will connect here. For now, your quiz and profile answers are saved.
          </p>
        ) : (
          <p className="text-slate-400 text-sm">Waiting to generate…</p>
        )}
      </div>

      {!generated ? (
        <Button className="w-full mb-2" onClick={handleGenerate}>
          Generate my hero
        </Button>
      ) : (
        <Button className="w-full" onClick={handleContinue}>
          Continue
        </Button>
      )}
    </Card>
  )
}
