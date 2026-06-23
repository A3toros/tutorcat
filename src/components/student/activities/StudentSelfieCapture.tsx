'use client'

import React, { useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import SuperheroSelfiePicker from './SuperheroSelfiePicker'

/** Legacy activity type — Lesson 4 no longer uses a separate selfie step. */
export default function StudentSelfieCapture({ activity, onComplete }: StudentActivityProps) {
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleContinue = () => {
    if (!photo) return
    setBusy(true)
    try {
      onComplete({
        score: 1,
        maxScore: 1,
        attempts: 1,
        answers: {
          skipped: false,
          selfie_data_url: photo,
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
      {activity.description && (
        <p className="text-sm text-slate-600 mb-4">{activity.description}</p>
      )}
      <SuperheroSelfiePicker photo={photo} onPhotoChange={setPhoto} disabled={busy} />
      <Button className="w-full mt-2" disabled={!photo || busy} onClick={handleContinue}>
        Continue
      </Button>
    </Card>
  )
}
