'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card } from '@/components/ui'
import { useCoarsePointer } from '@/lib/useCoarsePointer'
import type { StudentActivityProps } from '../activityProps'

const touchChip =
  'min-h-[44px] touch-manipulation select-none [-webkit-tap-highlight-color:transparent]'

const RETRY_RESET_MS = 2000

export default function StudentWordCategorize({ activity, onComplete }: StudentActivityProps) {
  const isTouch = useCoarsePointer()
  const allowDrag = !isTouch
  const buckets = (activity.content?.buckets as string[]) || [
    'Apps/Devices',
    'Activities',
    'Opinions',
  ]
  const words = useMemo(() => {
    const fromItems = (activity.vocabulary_items || []).map((v) => ({
      word: v.english_word,
      category: v.category || '',
    }))
    if (fromItems.length) return fromItems
    const fromContent = activity.content?.words as Array<{ word: string; category: string }>
    return fromContent || []
  }, [activity])

  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [selectedWord, setSelectedWord] = useState<string | null>(null)
  const [draggingWord, setDraggingWord] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (!error) return
    setResetting(true)
    const timer = setTimeout(() => {
      setAssignments({})
      setSelectedWord(null)
      setDraggingWord(null)
      setDropTarget(null)
      setError(null)
      setResetting(false)
    }, RETRY_RESET_MS)
    return () => clearTimeout(timer)
  }, [error])

  const unassigned = words.filter((w) => !assignments[w.word])

  const assignWord = (word: string, bucket: string) => {
    if (resetting) return
    setAssignments((prev) => ({ ...prev, [word]: bucket }))
    setSelectedWord(null)
    setDraggingWord(null)
    setDropTarget(null)
  }

  const handleBucketTap = (bucket: string) => {
    if (!selectedWord || resetting) return
    assignWord(selectedWord, bucket)
  }

  const handleDragStart = (word: string) => (e: React.DragEvent) => {
    if (resetting) return
    e.dataTransfer.setData('text/plain', word)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingWord(word)
    setSelectedWord(word)
  }

  const handleDragEnd = () => {
    setDraggingWord(null)
    setDropTarget(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (bucket: string) => (e: React.DragEvent) => {
    e.preventDefault()
    const word = e.dataTransfer.getData('text/plain') || draggingWord
    if (word) assignWord(word, bucket)
  }

  const handleSubmit = () => {
    let correct = 0
    words.forEach((w) => {
      if (assignments[w.word] === w.category) correct++
    })
    if (correct < words.length) {
      setError(`${correct}/${words.length} correct. Keep trying!`)
      return
    }
    onComplete({
      score: words.length,
      maxScore: words.length,
      attempts: 1,
      answers: { assignments },
    })
  }

  const wordChipClass = (word: string, inPool: boolean) => {
    const isSelected = selectedWord === word
    const isDragging = draggingWord === word
    return [
      'rounded-full border px-3 py-2 sm:py-1.5 text-sm transition-colors',
      touchChip,
      allowDrag && !resetting ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      isSelected || isDragging
        ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
        : 'border-slate-200 bg-white active:bg-purple-50',
      inPool ? '' : '',
    ].join(' ')
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-3">
        {activity.title || 'Categorize words'}
      </h2>

      <div
        className="mb-4 rounded-lg border border-purple-100 bg-purple-50/80 px-3 py-2.5 text-slate-700"
        role="note"
        aria-label="How to play"
      >
        <p className="font-semibold text-purple-800 mb-1.5 text-sm">How to play</p>
        {isTouch ? (
          <ul className="list-disc list-inside space-y-0.5 text-xs sm:text-sm">
            <li>
              <strong>Tap a word</strong>, then <strong>tap its category</strong>
            </li>
          </ul>
        ) : (
          <ol className="list-decimal list-inside space-y-0.5 text-xs sm:text-sm">
            <li>
              <strong>Tap a word</strong> (or <strong>drag</strong> it from the list)
            </li>
            <li>
              <strong>Tap a category</strong> — or <strong>drop</strong> the word on that box
            </li>
          </ol>
        )}
      </div>

      <p className="text-xs text-slate-500 mb-2">Words to sort</p>
      <div className="flex flex-wrap gap-2 mb-6 min-h-[2.5rem]">
        {unassigned.length === 0 ? (
          <span className="text-sm text-slate-400 italic">All words placed — check categories</span>
        ) : (
          unassigned.map((w) => (
            <button
              key={w.word}
              type="button"
              draggable={allowDrag && !resetting}
              onDragStart={allowDrag ? handleDragStart(w.word) : undefined}
              onDragEnd={allowDrag ? handleDragEnd : undefined}
              onClick={() => !resetting && setSelectedWord(w.word)}
              disabled={resetting}
              className={wordChipClass(w.word, true)}
              aria-pressed={selectedWord === w.word}
            >
              {w.word}
            </button>
          ))
        )}
      </div>

      <p className="text-xs text-slate-500 mb-2">Categories</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {buckets.map((bucket) => {
          const isDropHighlight = dropTarget === bucket
          const canAcceptTap = Boolean(selectedWord) && !resetting
          return (
            <div
              key={bucket}
              onDragOver={allowDrag ? handleDragOver : undefined}
              onDragEnter={allowDrag ? () => !resetting && setDropTarget(bucket) : undefined}
              onDragLeave={
                allowDrag ? () => setDropTarget((t) => (t === bucket ? null : t)) : undefined
              }
              onDrop={allowDrag ? handleDrop(bucket) : undefined}
              onClick={() => canAcceptTap && handleBucketTap(bucket)}
              role={canAcceptTap ? 'button' : undefined}
              className={[
                'min-h-[88px] sm:min-h-[120px] rounded-lg border-2 border-dashed p-3 transition-colors touch-manipulation',
                canAcceptTap ? 'cursor-pointer active:bg-purple-50' : '',
                isDropHighlight
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-slate-200 bg-slate-50/50',
                canAcceptTap ? 'ring-1 ring-purple-200' : '',
              ].join(' ')}
            >
              <p
                className={[
                  'font-semibold mb-2 w-full text-left text-sm sm:text-base pointer-events-none',
                  canAcceptTap ? 'text-purple-700' : 'text-slate-700',
                ].join(' ')}
              >
                {bucket}
                {canAcceptTap && isTouch ? (
                  <span className="block text-xs font-normal text-purple-600 mt-0.5">
                    Tap to place word
                  </span>
                ) : null}
              </p>
              <div className="flex flex-wrap gap-1">
                {words
                  .filter((w) => assignments[w.word] === bucket)
                  .map((w) => (
                    <span
                      key={w.word}
                      draggable={allowDrag && !resetting}
                      onDragStart={allowDrag ? handleDragStart(w.word) : undefined}
                      onDragEnd={allowDrag ? handleDragEnd : undefined}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!resetting) setSelectedWord(w.word)
                      }}
                      className={wordChipClass(w.word, false)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedWord(w.word)
                        }
                      }}
                    >
                      {w.word}
                    </span>
                  ))}
              </div>
            </div>
          )
        })}
      </div>

      {selectedWord && !resetting && (
        <p className="text-sm text-purple-700 mt-3 text-center sm:text-left">
          Selected: <strong>{selectedWord}</strong> —{' '}
          {isTouch ? 'tap a category' : 'tap or drop on a category'}
        </p>
      )}

      {error && (
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm mt-4">
          {error}
        </p>
      )}
      <Button
        className="mt-5 w-full sm:w-auto"
        onClick={handleSubmit}
        disabled={unassigned.length > 0 || resetting}
      >
        Continue
      </Button>
    </Card>
  )
}
