'use client'

import React from 'react'
import type { StudentActivityType, StudentLesson, StudentLessonActivity } from '@/types/student'
import type { StudentActivityProps } from './activityProps'
import StudentPollActivity from './activities/StudentPollActivity'
import StudentVocabularyIntro from './activities/StudentVocabularyIntro'
import StudentPictureWordMatch from './activities/StudentPictureWordMatch'
import StudentMissingLetters from './activities/StudentMissingLetters'
import StudentWordCategorize from './activities/StudentWordCategorize'
import StudentSpeedTap from './activities/StudentSpeedTap'
import StudentGrammarBuilder from './activities/StudentGrammarBuilder'
import StudentGrammarDragOrder from './activities/StudentGrammarDragOrder'
import StudentGrammarMakeQuestion from './activities/StudentGrammarMakeQuestion'
import StudentGrammarMcq from './activities/StudentGrammarMcq'
import StudentGrammarFrequency from './activities/StudentGrammarFrequency'
import StudentGrammarComplete from './activities/StudentGrammarComplete'
import StudentGrammarErrorFix from './activities/StudentGrammarErrorFix'
import StudentSpeakingCards from './activities/StudentSpeakingCards'
import StudentChallengeWheel from './activities/StudentChallengeWheel'

const REGISTRY: Record<StudentActivityType, React.ComponentType<StudentActivityProps>> = {
  student_warmup_poll: StudentPollActivity,
  student_exit_poll: StudentPollActivity,
  student_vocabulary_intro: StudentVocabularyIntro,
  student_vocab_picture_match: StudentPictureWordMatch,
  student_vocab_missing_letters: StudentMissingLetters,
  student_vocab_categorize: StudentWordCategorize,
  student_vocab_speed_tap: StudentSpeedTap,
  student_grammar_builder: StudentGrammarBuilder,
  student_grammar_drag_order: StudentGrammarDragOrder,
  student_grammar_mcq: StudentGrammarMcq,
  student_grammar_frequency: StudentGrammarFrequency,
  student_grammar_complete: StudentGrammarComplete,
  student_grammar_error_fix: StudentGrammarErrorFix,
  student_grammar_make_question: StudentGrammarMakeQuestion,
  student_speaking_cards: StudentSpeakingCards,
  student_challenge_wheel: StudentChallengeWheel,
}

interface Props {
  activity: StudentLessonActivity
  lesson: StudentLesson
  onComplete: StudentActivityProps['onComplete']
}

export default function StudentActivityRenderer({ activity, lesson, onComplete }: Props) {
  const Component = REGISTRY[activity.activity_type as StudentActivityType]

  if (!Component) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Unknown activity type: {activity.activity_type}
      </div>
    )
  }

  return <Component activity={activity} lesson={lesson} onComplete={onComplete} />
}
