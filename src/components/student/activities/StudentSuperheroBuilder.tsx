'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card, Select } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import {
  computeHeroMatch,
  parseQuizContent,
  type HeroId,
} from '@/lib/lesson4SuperheroQuiz'
import { portraitUrlCandidates } from '@/lib/superheroPortraits'

function HeroPortrait({
  heroId,
  name,
  emoji,
}: {
  heroId: HeroId
  name: string
  emoji: string
}) {
  const candidates = useMemo(() => portraitUrlCandidates(heroId), [heroId])
  const [index, setIndex] = useState(0)
  const src = candidates[index]
  const exhausted = index >= candidates.length

  if (exhausted || !src) {
    return (
      <div className="w-48 h-60 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-6xl">
        {emoji}
      </div>
    )
  }

  return (
    <div className="w-48 h-60 rounded-lg overflow-hidden bg-slate-100 border border-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        className="w-full h-full object-cover object-top"
        onError={() => setIndex((i) => i + 1)}
      />
    </div>
  )
}

export default function StudentSuperheroBuilder({ activity, onComplete }: StudentActivityProps) {
  const quiz = useMemo(
    () => parseQuizContent(activity.content as Record<string, unknown>),
    [activity.content]
  )
  const questions = quiz.questions

  const [step, setStep] = useState(0)
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ReturnType<typeof computeHeroMatch>>(null)

  const current = questions[step]
  const allAnswered = questions.every((q) => Boolean(responses[q.id]))
  const showingResult = result !== null

  const handleSelect = (questionId: string, optionId: string) => {
    setResponses((prev) => ({ ...prev, [questionId]: optionId }))
  }

  const handleNext = () => {
    if (step < questions.length - 1) setStep((s) => s + 1)
  }

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  const handleSeeResult = () => {
    const match = computeHeroMatch(quiz, responses)
    if (match) setResult(match)
  }

  const handleFinish = () => {
    const match = result ?? computeHeroMatch(quiz, responses)
    if (!match) return
    onComplete({
      score: questions.length,
      maxScore: questions.length,
      attempts: 1,
      answers: {
        gender_pool: match.gender_pool,
        responses,
        scores: match.scores,
        matched_hero_id: match.matched_hero_id,
        matched_hero_name: match.matched_hero_name,
        match_why: match.match_why,
        image_url: match.image_url,
        savedAt: new Date().toISOString(),
      },
    })
  }

  if (!questions.length) {
    return (
      <Card className="p-4 sm:p-6">
        <p className="text-slate-600">Quiz not configured.</p>
      </Card>
    )
  }

  if (showingResult && result) {
    return (
      <Card className="p-4 sm:p-6 max-w-lg mx-auto">
        <h2 className="text-xl font-semibold text-slate-800 mb-4 text-center">Your hero match</h2>
        <div className="flex flex-col items-center gap-4 mb-4">
          <HeroPortrait
            heroId={result.matched_hero_id}
            name={result.matched_hero_name}
            emoji={result.emoji}
          />
          <p className="text-2xl font-bold text-slate-800">{result.matched_hero_name}</p>
        </div>
        <p className="text-slate-700 text-sm leading-relaxed mb-6">{result.match_why}</p>
        <Button className="w-full" onClick={handleFinish}>
          Continue
        </Button>
      </Card>
    )
  }

  const selected = current ? responses[current.id] : ''

  return (
    <Card className="p-4 sm:p-6 max-w-lg mx-auto">
      <p className="text-xs text-slate-500 mb-1">
        Question {step + 1} of {questions.length}
      </p>
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-4">
        {activity.title || 'Which hero are you?'}
      </h2>
      {current && (
        <>
          <p className="text-slate-700 font-medium mb-3">{current.prompt}</p>
          <Select
            id={`quiz-${current.id}`}
            value={selected}
            onChange={(e) => handleSelect(current.id, e.target.value)}
            className="min-h-[48px] text-base w-full mb-4"
          >
            <option value="">Choose an answer…</option>
            {current.options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </Select>
        </>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {step > 0 && (
          <Button variant="secondary" onClick={handleBack}>
            Back
          </Button>
        )}
        {step < questions.length - 1 && (
          <Button disabled={!selected} onClick={handleNext}>
            Next
          </Button>
        )}
        {step === questions.length - 1 && allAnswered && (
          <Button onClick={handleSeeResult}>See my hero</Button>
        )}
      </div>
    </Card>
  )
}
