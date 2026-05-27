'use client'

import React, { useMemo, useState } from 'react'
import { Button, Card, Select } from '@/components/ui'
import type { StudentActivityProps } from '../activityProps'

const DEFAULT_APPS = ['Instagram', 'TikTok', 'Facebook', 'YouTube']
const DEFAULT_REASONS = [
  'I can watch videos',
  'I can chat with friends',
  'it is fun',
  'I learn new things',
]

export default function StudentGrammarComplete({ activity, onComplete }: StudentActivityProps) {
  const content = activity.content || {}
  const apps = (content.apps as string[])?.length ? (content.apps as string[]) : DEFAULT_APPS
  const reasons = (content.reasons as string[])?.length
    ? (content.reasons as string[])
    : DEFAULT_REASONS
  const template =
    (content.template as string) || 'My favorite app is {app} because {reason}.'
  const slot1Label =
    (content.slot1_label as string) ||
    (template.includes('{app}') && template.includes('think') ? 'Choose content' : 'Choose an app')
  const slot2Label =
    (content.slot2_label as string) ||
    (template.includes('{reason}') && template.includes('think') ? 'Choose an adjective' : 'Choose a reason')
  const promptLine =
    (content.prompt_line as string) ||
    template
      .replace('{app}', '______')
      .replace('{reason}', '______')
      .replace(/\.$/, '')

  const [app, setApp] = useState('')
  const [reason, setReason] = useState('')

  const preview = useMemo(() => {
    if (!app || !reason) return null
    return template.replace('{app}', app).replace('{reason}', reason)
  }, [template, app, reason])

  const ready = Boolean(app && reason)

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-800 mb-2">
        {activity.title || 'Complete the sentence'}
      </h2>
      {activity.description && (
        <p className="text-slate-600 text-sm mb-4">{activity.description}</p>
      )}

      <p className="text-lg text-slate-800 mb-4 leading-relaxed">{promptLine}</p>

      <div className="space-y-4 max-w-md">
        <div>
          <label htmlFor="grammar-complete-app" className="block text-sm font-medium text-slate-700 mb-1">
            {slot1Label}
          </label>
          <Select
            id="grammar-complete-app"
            value={app}
            onChange={(e) => setApp(e.target.value)}
            className="min-h-[48px] text-base touch-manipulation"
          >
            <option value="">Select an app…</option>
            {apps.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label
            htmlFor="grammar-complete-reason"
            className="block text-sm font-medium text-slate-700 mb-1"
          >
            {slot2Label}
          </label>
          <Select
            id="grammar-complete-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[48px] text-base touch-manipulation"
          >
            <option value="">Select a reason…</option>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {preview && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-xs text-green-800 font-medium mb-1">Your sentence</p>
          <p className="text-slate-800">{preview}</p>
        </div>
      )}

      <Button
        className="mt-6 w-full sm:w-auto"
        disabled={!ready}
        onClick={() =>
          onComplete({
            score: 1,
            maxScore: 1,
            attempts: 1,
            answers: {
              app,
              reason,
              sentence: preview || `My favorite app is ${app} because ${reason}.`,
            },
          })
        }
      >
        Continue
      </Button>
    </Card>
  )
}
