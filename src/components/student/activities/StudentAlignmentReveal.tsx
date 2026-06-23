'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card, Select } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import {
  buildSuperheroAiBundleFromResults,
  classifyHeroAlignmentRequest,
  type HeroAlignment,
} from '@/lib/superheroAi'

const DEFAULT_ALIGNMENT_DESCRIPTION = 'The Magic Hat will decide your fate.'

function isAdminLessonTestMode(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Window & { __ADMIN_LESSON_TEST_MODE?: boolean }).__ADMIN_LESSON_TEST_MODE)
}

export default function StudentAlignmentReveal({
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

  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alignment, setAlignment] = useState<HeroAlignment>('hero')
  const [reason, setReason] = useState('')
  const [traits, setTraits] = useState<string[]>([])
  const [agree, setAgree] = useState('')

  const handleReveal = async () => {
    setLoading(true)
    setError(null)
    const adminTest = isAdminLessonTestMode()
    const res = await classifyHeroAlignmentRequest(
      adminTest
        ? { bundle, useAdminApi: true }
        : { studentLessonId: lesson.id }
    )
    setLoading(false)
    if (!res.success || !res.data) {
      setError(
        res.error ||
          (hasProfile
            ? 'The Magic Hat could not decide. Try again.'
            : 'Complete the Powers & weakness sentences activity first, then try again.')
      )
      return
    }
    setAlignment(res.data.alignment)
    setReason(res.data.reasons.join(' '))
    setTraits(res.data.traits)
    setRevealed(true)
  }

  const handleContinue = () => {
    const agreeScore = agree ? 1 : 0
    onComplete({
      score: 1 + agreeScore,
      maxScore: 2,
      attempts: 1,
      answers: {
        alignment_ai: alignment,
        alignment_ai_reason: reason,
        alignment_ai_traits: traits,
        student_agrees: agree === 'yes',
        revealedAt: new Date().toISOString(),
      },
    })
  }

  return (
    <Card className="p-4 sm:p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-slate-800 mb-2">
        {activity.title || 'Are you a hero or a villain?'}
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        {activity.description || DEFAULT_ALIGNMENT_DESCRIPTION}
      </p>

      {!hasProfile && !isAdminLessonTestMode() && (
        <p className="text-sm text-amber-700 mb-3">
          Finish activity #11 (Powers & weakness sentences) before the AI can judge your character.
        </p>
      )}

      {error && <p className="text-sm text-amber-700 mb-3">{error}</p>}

      {!revealed ? (
        <Button
          className="w-full mt-2"
          onClick={handleReveal}
          disabled={loading || (!hasProfile && !isAdminLessonTestMode())}
        >
          {loading ? 'The Magic Hat is thinking…' : 'Start prediction'}
        </Button>
      ) : (
        <>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 mb-4">
            <p className="text-sm text-indigo-900 font-medium mb-1">
              The Magic Hat says: <span className="capitalize">{alignment.replace('-', ' ')}</span>
            </p>
            <p className="text-sm text-slate-700">{reason}</p>
            {traits.length > 0 && (
              <p className="text-xs text-slate-600 mt-2">Traits: {traits.join(', ')}</p>
            )}
          </div>
          <label htmlFor="agree-ai" className="block text-sm font-medium text-slate-700 mb-1">
            Do you agree with the Magic Hat?
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
