/** Lesson % from activity score / maxScore rows (speaking uses AI 0–100 per card). */

export function computeLessonPercentage(
  rows: Array<{ score: number; maxScore: number }>
): number {
  const totalScore = rows.reduce((s, r) => s + (Number(r.score) || 0), 0)
  const maxScore = rows.reduce((s, r) => s + (Number(r.maxScore) || 0), 0)
  return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 100
}

export function speakingCardsTotals(
  results: Record<number, { overall_score?: number } | undefined>,
  promptCount: number
): { score: number; maxScore: number } {
  let score = 0
  for (let i = 0; i < promptCount; i++) {
    const s = results[i]?.overall_score
    if (typeof s === 'number') score += s
  }
  return { score, maxScore: Math.max(promptCount, 1) * 100 }
}

export function challengeWheelTotals(overallScore: number | undefined): {
  score: number
  maxScore: number
} {
  return {
    score: typeof overallScore === 'number' ? overallScore : 0,
    maxScore: 100,
  }
}

export function effectiveActivityScore(row: {
  activityType?: string
  score?: number
  maxScore?: number
  answers?: unknown
  feedback?: unknown
}): { score: number; maxScore: number } {
  const score = Number(row.score) || 0
  const maxScore = Number(row.maxScore) || 0
  const type = row.activityType || ''

  if (type === 'student_speaking_cards' || type === 'student_character_story') {
    const feedback = row.feedback as Record<string, { overall_score?: number }> | null
    const answers = row.answers as { prompts?: Array<{ score?: number }> } | null
    let sum = 0
    let count = 0
    if (feedback && typeof feedback === 'object' && !Array.isArray(feedback)) {
      for (const v of Object.values(feedback)) {
        if (v && typeof v.overall_score === 'number') {
          sum += v.overall_score
          count++
        }
      }
    }
    if (count === 0 && Array.isArray(answers?.prompts)) {
      for (const p of answers!.prompts!) {
        if (typeof p.score === 'number') {
          sum += p.score
          count++
        }
      }
    }
    if (count > 0) return { score: sum, maxScore: count * 100 }
  }

  if (type === 'student_challenge_wheel') {
    const feedback = row.feedback as { overall_score?: number } | null
    const answers = row.answers as { overall_score?: number } | null
    const ai = feedback?.overall_score ?? answers?.overall_score
    if (typeof ai === 'number') return { score: ai, maxScore: 100 }
  }

  return { score, maxScore }
}
