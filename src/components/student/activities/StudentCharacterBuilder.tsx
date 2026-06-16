'use client'

import React, { useCallback, useRef, useState } from 'react'
import { Button, Card } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'
import CharacterCanvas from '../character-builder/CharacterCanvas'
import CategoryPicker from '../character-builder/CategoryPicker'
import {
  CHARACTER_CATEGORIES,
  DEFAULT_CHARACTER_SELECTIONS,
  isCharacterComplete,
  type CharacterCategoryId,
  type CharacterSelections,
} from '@/lib/characterBuilder/characterConfig'
import { captureElementAsPng } from '@/lib/characterBuilder/exportCharacterImage'
import { saveStoredCharacter, resolveSourceActivityOrder } from '@/lib/characterBuilder/characterStorage'
import { useUser } from '@/components/auth/ProtectedRoute'

function randomChoice<T extends { id: string }>(options: T[]): string {
  return options[Math.floor(Math.random() * options.length)]!.id
}

export default function StudentCharacterBuilder({ activity, lesson, activities, onComplete }: StudentActivityProps) {
  const { user } = useUser()
  const userId =
    user?.id ??
    (typeof window !== 'undefined' && (window as any).__ADMIN_LESSON_TEST_MODE ? 'admin-test' : 'guest')
  const [selection, setSelection] = useState<CharacterSelections>(DEFAULT_CHARACTER_SELECTIONS)
  const [characterName, setCharacterName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const captureRef = useRef<HTMLDivElement>(null)

  const onCategoryChange = useCallback((categoryId: CharacterCategoryId, optionId: string) => {
    setSelection((prev) => ({ ...prev, [categoryId]: optionId }))
    setError(null)
  }, [])

  const handleRandomize = () => {
    const next = { ...DEFAULT_CHARACTER_SELECTIONS }
    for (const cat of CHARACTER_CATEGORIES) {
      next[cat.id] = randomChoice(cat.options)
    }
    setSelection(next)
    setError(null)
  }

  const handleContinue = async () => {
    if (!isCharacterComplete(selection)) {
      setError('Choose every category before you continue.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let previewImage: string | undefined
      if (captureRef.current) {
        previewImage = await captureElementAsPng(captureRef.current)
      }
      const answers: CharacterSelections & { preview_image?: string } = {
        ...selection,
        ...(characterName.trim() ? { characterName: characterName.trim() } : {}),
        ...(previewImage ? { preview_image: previewImage } : {}),
      }
      const sourceActivityOrder = resolveSourceActivityOrder(activities, activity.activity_order)
      saveStoredCharacter(userId, lesson.id, {
        ...answers,
        sourceActivityOrder,
      })
      onComplete({
        score: 1,
        maxScore: 1,
        attempts: 1,
        answers,
        feedback: { passed: true },
      })
    } catch {
      setError('Could not save your character image. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-1">
        {activity.title || 'Design your character'}
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        {activity.description ||
          'Use the same categories as the character creator: skin, eyes, mouth, hair, clothes, and more. Press Continue when you are done.'}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <CharacterCanvas
            selection={selection}
            characterName={characterName}
            captureRef={captureRef}
          />
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Character name (optional)</span>
            <input
              type="text"
              maxLength={26}
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="Skibidi"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <Button variant="secondary" size="sm" className="w-full sm:w-auto" onClick={handleRandomize}>
            Random character
          </Button>
        </div>

        <CategoryPicker categories={CHARACTER_CATEGORIES} selection={selection} onChange={onCategoryChange} />
      </div>

      {error ? (
        <p className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      <Button className="mt-4 w-full sm:w-auto" onClick={handleContinue} disabled={busy}>
        {busy ? 'Saving…' : 'Continue'}
      </Button>
    </Card>
  )
}
