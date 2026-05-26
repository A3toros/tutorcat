'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import StudentVocabImage from '@/components/student/StudentVocabImage'
import {
  lesson1PictureMatchFallbackItems,
  parseStudentVocabularyItems,
} from '@/lib/studentLessonNormalize'
import { resolveStudentVocabImageUrl } from '@/lib/studentVocabImages'
import { useCoarsePointer } from '@/lib/useCoarsePointer'
import type { StudentActivityProps } from '../activityProps'

const touchTarget =
  'min-h-[48px] touch-manipulation select-none [-webkit-tap-highlight-color:transparent]'

export default function StudentPictureWordMatch({ activity, onComplete }: StudentActivityProps) {
  const isTouch = useCoarsePointer()
  const pairs = useMemo(() => {
    const fromApi = parseStudentVocabularyItems(activity.vocabulary_items)
    if (fromApi.length > 0) return fromApi
    return lesson1PictureMatchFallbackItems(activity.id)
  }, [activity.vocabulary_items, activity.id])

  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null)
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null)
  const [draggingWord, setDraggingWord] = useState<{ id: string; word: string } | null>(null)
  const [dropTargetWordId, setDropTargetWordId] = useState<string | null>(null)
  const [dropTargetImageId, setDropTargetImageId] = useState<string | null>(null)
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const shuffledWords = useMemo(() => {
    const words = pairs.map((p) => ({ id: p.id, word: p.english_word }))
    return [...words].sort(() => Math.random() - 0.5)
  }, [pairs])

  const allowDrag = !isTouch

  const clearSelection = () => {
    setSelectedImageId(null)
    setSelectedWordId(null)
  }

  const clearDragState = () => {
    setDraggingImageId(null)
    setDraggingWord(null)
    setDropTargetWordId(null)
    setDropTargetImageId(null)
  }

  const tryMatch = (imageId: string, wordId: string, word: string): boolean => {
    const imageItem = pairs.find((p) => p.id === imageId)
    if (!imageItem || matches[imageId]) return false

    if (imageItem.english_word === word) {
      setMatches((prev) => ({ ...prev, [imageId]: wordId }))
      clearSelection()
      setError(null)
      clearDragState()
      return true
    }

    setError('Try again — match the picture to the correct word.')
    clearSelection()
    clearDragState()
    return false
  }

  const handleWordTap = (wordId: string, word: string) => {
    if (Object.values(matches).includes(wordId)) return

    if (selectedImageId) {
      tryMatch(selectedImageId, wordId, word)
      return
    }

    setSelectedWordId((prev) => (prev === wordId ? null : wordId))
    setSelectedImageId(null)
    setError(null)
  }

  const handleImageTap = (imageId: string) => {
    if (matches[imageId]) return

    const word = shuffledWords.find((w) => w.id === selectedWordId)
    if (selectedWordId && word) {
      tryMatch(imageId, word.id, word.word)
      return
    }

    setSelectedImageId((prev) => (prev === imageId ? null : imageId))
    setSelectedWordId(null)
    setError(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDropOnWord = (wordId: string, word: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const imageId =
      e.dataTransfer.getData('application/x-tutorcat-image-id') || draggingImageId
    if (imageId) tryMatch(imageId, wordId, word)
    else clearDragState()
  }

  const handleDropOnImage = (imageId: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const wordId = e.dataTransfer.getData('application/x-tutorcat-word-id') || draggingWord?.id
    const word =
      e.dataTransfer.getData('text/plain') ||
      draggingWord?.word ||
      pairs.find((p) => p.id === wordId)?.english_word
    if (wordId && word) tryMatch(imageId, wordId, word)
    else clearDragState()
  }

  const matchedCount = Object.keys(matches).length
  const done = matchedCount === pairs.length && pairs.length > 0

  const selectionHint = selectedImageId
    ? 'Picture selected — tap the matching word'
    : selectedWordId
      ? 'Word selected — tap the matching picture'
      : 'Tap a picture, then a word — or a word, then a picture'

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-2">
        {activity.title || 'Match picture to word'}
      </h2>

      <div
        className="mb-4 rounded-lg border border-purple-100 bg-purple-50/80 px-3 py-2.5 text-slate-700"
        role="note"
      >
        <p className="font-semibold text-purple-800 mb-1.5 text-sm">How to play</p>
        <ul className="space-y-1 text-xs sm:text-sm list-disc list-inside">
          <li>
            <strong>Tap a picture</strong>, then <strong>tap</strong> the matching word
          </li>
          <li>
            Or <strong>tap a word</strong> first, then <strong>tap</strong> the matching picture
          </li>
        </ul>
      </div>

      <p className="text-xs text-slate-500 mb-3" aria-live="polite">
        {matchedCount} of {pairs.length} matched
      </p>

      <div className="flex flex-col gap-5 md:grid md:grid-cols-2 md:gap-6">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            Pictures
          </p>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {pairs.map((item) => {
              const matched = matches[item.id]
              const isSelected = selectedImageId === item.id
              const isDragging = draggingImageId === item.id
              const isDropHighlight = dropTargetImageId === item.id
              const canAcceptWord = Boolean(selectedWordId) && !matched
              const statusLabel = matched
                ? 'Matched'
                : isSelected
                  ? 'Selected'
                  : canAcceptWord
                    ? 'Tap to match'
                    : null
              return (
                <div
                  key={item.id}
                  draggable={allowDrag && !matched}
                  onDragStart={
                    allowDrag
                      ? (e) => {
                          if (matched) return
                          e.dataTransfer.setData('application/x-tutorcat-image-id', item.id)
                          e.dataTransfer.setData('text/plain', item.english_word)
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggingImageId(item.id)
                          setSelectedImageId(item.id)
                          setSelectedWordId(null)
                        }
                      : undefined
                  }
                  onDragEnd={allowDrag ? clearDragState : undefined}
                  onDragOver={allowDrag ? handleDragOver : undefined}
                  onDragEnter={
                    allowDrag ? () => !matched && setDropTargetImageId(item.id) : undefined
                  }
                  onDragLeave={
                    allowDrag
                      ? () => setDropTargetImageId((t) => (t === item.id ? null : t))
                      : undefined
                  }
                  onDrop={allowDrag ? handleDropOnImage(item.id) : undefined}
                  onClick={() => handleImageTap(item.id)}
                  role="button"
                  tabIndex={matched ? -1 : 0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleImageTap(item.id)
                    }
                  }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 sm:px-2.5 sm:py-2.5 text-center transition-colors ${touchTarget} ${
                    allowDrag && !matched ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                  } ${
                    matched
                      ? 'border-green-400 bg-green-50 opacity-80'
                      : isDropHighlight || canAcceptWord
                        ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                        : isSelected || isDragging
                          ? 'border-purple-500 ring-2 ring-purple-200 bg-purple-50/50'
                          : 'border-slate-200 active:bg-purple-50'
                  }`}
                >
                  <div className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 overflow-hidden rounded-md bg-slate-100 pointer-events-none">
                    <StudentVocabImage
                      src={resolveStudentVocabImageUrl(item.english_word, item.image_url)}
                      alt={item.english_word}
                    />
                  </div>
                  <span
                    className={`min-h-[14px] text-[10px] sm:text-xs leading-tight ${
                      statusLabel
                        ? matched
                          ? 'text-green-700 font-medium'
                          : 'text-purple-700'
                        : 'invisible'
                    }`}
                    aria-hidden={!statusLabel}
                  >
                    {statusLabel ?? '·'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Words</p>
          <div className="flex flex-wrap gap-2">
            {shuffledWords.map((w) => {
              const used = Object.values(matches).includes(w.id)
              const isSelected = selectedWordId === w.id
              const canTap = !used
              const canAcceptImage = Boolean(selectedImageId) && !used
              const isDropHighlight = dropTargetWordId === w.id
              return (
                <span
                  key={w.id}
                  draggable={allowDrag && !used}
                  onDragStart={
                    allowDrag
                      ? (e) => {
                          if (used) return
                          e.dataTransfer.setData('application/x-tutorcat-word-id', w.id)
                          e.dataTransfer.setData('text/plain', w.word)
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggingWord({ id: w.id, word: w.word })
                          setSelectedWordId(w.id)
                          setSelectedImageId(null)
                        }
                      : undefined
                  }
                  onDragEnd={allowDrag ? clearDragState : undefined}
                  onDragOver={allowDrag ? handleDragOver : undefined}
                  onDragEnter={
                    allowDrag ? () => !used && setDropTargetWordId(w.id) : undefined
                  }
                  onDragLeave={
                    allowDrag
                      ? () => setDropTargetWordId((t) => (t === w.id ? null : t))
                      : undefined
                  }
                  onDrop={allowDrag ? handleDropOnWord(w.id, w.word) : undefined}
                  onClick={() => canTap && handleWordTap(w.id, w.word)}
                  role="button"
                  tabIndex={used ? -1 : 0}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && canTap) {
                      e.preventDefault()
                      handleWordTap(w.id, w.word)
                    }
                  }}
                  className={`inline-flex items-center justify-center rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${touchTarget} ${
                    allowDrag && !used ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                  } ${
                    used
                      ? 'border-green-300 bg-green-50 text-green-800 line-through opacity-70'
                      : isDropHighlight || canAcceptImage
                        ? 'border-purple-500 bg-purple-100 ring-2 ring-purple-200'
                        : isSelected
                          ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                          : canAcceptImage
                            ? 'border-purple-400 bg-purple-50'
                            : 'border-slate-200 bg-white active:bg-purple-50'
                  }`}
                >
                  {w.word}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {(selectedImageId || selectedWordId) && !draggingImageId && !draggingWord && (
        <p className="text-sm text-purple-700 mt-3 text-center sm:text-left">{selectionHint}</p>
      )}

      {error && (
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm mt-3">
          {error}
        </p>
      )}

      <Button className="mt-5 w-full sm:w-auto" disabled={!done} onClick={() =>
        onComplete({
          score: pairs.length,
          maxScore: pairs.length,
          attempts: 1,
          answers: { matches },
        })
      }>
        Continue
      </Button>
    </Card>
  )
}
