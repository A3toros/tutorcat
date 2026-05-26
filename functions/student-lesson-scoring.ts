/** Shared lesson scoring (mirrors src/lib/studentLessonScoring.ts). */

export function effectiveActivityScore(row: {
  activity_type?: string
  score?: number | string
  max_score?: number | string
  answers?: unknown
  feedback?: unknown
}): { score: number; maxScore: number } {
  const score = Number(row.score) || 0
  const maxScore = Number(row.max_score) || 0
  const type = row.activity_type || ''

  if (type === 'student_speaking_cards') {
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

export function sumEffectiveScores(
  rows: Array<{
    activity_type?: string
    score?: number | string
    max_score?: number | string
    answers?: unknown
    feedback?: unknown
  }>
): { totalScore: number; maxScore: number; percentage: number } {
  let totalScore = 0
  let maxScore = 0
  for (const row of rows) {
    const e = effectiveActivityScore(row)
    totalScore += e.score
    maxScore += e.maxScore
  }
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 100
  return { totalScore, maxScore, percentage }
}
