'use client'

import React, { useState } from 'react'
import { Button, Card, Select } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

/** Phase C stub — precoded demo until classify-hero-alignment function ships. */
export default function StudentAlignmentReveal({ activity, onComplete }: StudentActivityProps) {
  const demoAlignment =
    typeof activity.content?.demo_alignment === 'string'
      ? activity.content.demo_alignment
      : 'hero'
  const demoReason =
    typeof activity.content?.demo_reason === 'string'
      ? activity.content.demo_reason
      : 'You help people and make kind choices. Your character sounds like a hero!'

  const [revealed, setRevealed] = useState(false)
  const [agree, setAgree] = useState('')

  const handleReveal = () => setRevealed(true)

  const handleContinue = () => {
    const agreeScore = agree ? 1 : 0
    onComplete({
      score: 1 + agreeScore,
      maxScore: 2,
      attempts: 1,
      answers: {
        alignment_ai: demoAlignment,
        alignment_ai_reason: demoReason,
        student_agrees: agree === 'yes',
        revealedAt: new Date().toISOString(),
      },
    })
  }

  return (
    <Card className="p-4 sm:p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-slate-800 mb-2">
        {activity.title || 'Hero or villain?'}
      </h2>
      {!revealed ? (
        <Button className="w-full mt-4" onClick={handleReveal}>
          Reveal AI verdict
        </Button>
      ) : (
        <>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 mb-4">
            <p className="text-sm text-indigo-900 font-medium mb-1">
              AI says: <span className="capitalize">{demoAlignment}</span>
            </p>
            <p className="text-sm text-slate-700">{demoReason}</p>
          </div>
          <label htmlFor="agree-ai" className="block text-sm font-medium text-slate-700 mb-1">
            Do you agree with the AI?
          </label>
          <Select
            id="agree-ai"
            value={agree}
            onChange={(e) => setAgree(e.target.value)}
            className="w-full min-h-[48px] mb-4"
          >
            <option value="">Choose…</option>
            <option value="yes">Yes, I agree</option>
            <option value="no">No, I disagree</option>
          </Select>
          <Button className="w-full" disabled={!agree} onClick={handleContinue}>
            Continue
          </Button>
        </>
      )}
    </Card>
  )
}
