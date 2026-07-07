// Student classroom track types

export type StudentActivityType =
  | 'student_warmup_poll'
  | 'student_vocabulary_intro'
  | 'student_vocab_picture_match'
  | 'student_vocab_missing_letters'
  | 'student_vocab_categorize'
  | 'student_vocab_speed_tap'
  | 'student_grammar_builder'
  | 'student_grammar_drag_order'
  | 'student_grammar_mcq'
  | 'student_grammar_frequency'
  | 'student_grammar_complete'
  | 'student_grammar_error_fix'
  | 'student_grammar_make_question'
  | 'student_speaking_cards'
  | 'student_challenge_wheel'
  | 'student_character_builder'
  | 'student_vocab_image_mcq'
  | 'student_character_description'
  | 'student_character_story'
  | 'student_superhero_builder'
  | 'student_superhero_profile'
  | 'student_selfie_capture'
  | 'student_alignment_reveal'
  | 'student_superhero_image_generate'
  | 'student_exit_poll'

export type StudentSectionId =
  | 'warmup'
  | 'vocabulary_learning'
  | 'vocabulary_games'
  | 'grammar_builder'
  | 'grammar_practice'
  | 'speaking'
  | 'challenge'
  | 'exit'

export interface StudentVocabularyItem {
  id: string
  activity_id: string
  english_word: string
  thai_translation?: string | null
  audio_url?: string | null
  image_url?: string | null
  emoji?: string | null
  category?: string | null
  sort_order: number
  created_at?: string
}

export interface StudentGrammarItem {
  id: string
  activity_id: string
  item_kind: string
  original_sentence?: string | null
  correct_sentence: string
  words_array?: string[] | null
  options?: Record<string, unknown> | null
  hint?: string | null
  sort_order: number
}

export interface StudentPollItem {
  id: string
  activity_id: string
  question: string
  options: Array<{ id: string; label: string }>
  allow_multiple: boolean
  correct_option_id?: string | null
  sort_order: number
}

export interface StudentLessonActivity {
  id: string
  student_lesson_id: string
  activity_type: StudentActivityType
  activity_order: number
  title?: string | null
  description?: string | null
  estimated_time_seconds?: number | null
  content: Record<string, unknown>
  vocabulary_items?: StudentVocabularyItem[]
  grammar_items?: StudentGrammarItem[]
  poll_items?: StudentPollItem[]
  created_at?: string
  updated_at?: string
}

export interface StudentLesson {
  id: string
  lesson_number: number
  topic: string
  slug?: string | null
  live_duration_minutes?: number | null
  communication_goal?: string | null
  grammar_focus: Record<string, unknown>
  vocabulary_list: unknown[]
  active: boolean
  version: number
  created_at: string
  updated_at: string
}

export interface StudentUserProgress {
  id?: string
  user_id: string
  student_lesson_id: string
  score: number
  completed: boolean
  completed_at?: string | null
  attempts: number
  progress_percentage?: number
}

export interface StudentActivityResult {
  activityId?: string | null
  activityType: string
  activityOrder: number
  score: number
  maxScore: number
  attempts: number
  timeSpent?: number
  completed: boolean
  completedAt?: number
  answers?: unknown
  feedback?: unknown
}

export interface StudentActivityCompletePayload {
  activityId: string
  activityType: StudentActivityType
  activityOrder: number
  score?: number
  maxScore?: number
  attempts?: number
  timeSpent?: number
  answers?: unknown
  feedback?: unknown
  isFinal?: boolean
}

export interface StudentDashboardLesson {
  id: string
  lesson_number: number
  topic: string
  slug?: string | null
  level?: string | null
  track?: 'classroom' | 'platform'
  communication_goal?: string | null
  completed: boolean
  score: number
  score_percentage?: number | null
  progress_percentage: number
  locked: boolean
}

export const STUDENT_SECTIONS: Array<{
  id: StudentSectionId
  label: string
  activityTypes: StudentActivityType[]
}> = [
  { id: 'warmup', label: 'Warmup Poll', activityTypes: ['student_warmup_poll'] },
  { id: 'vocabulary_learning', label: 'Vocabulary Learning', activityTypes: ['student_vocabulary_intro'] },
  {
    id: 'vocabulary_games',
    label: 'Vocabulary Games',
    activityTypes: [
      'student_vocab_picture_match',
      'student_vocab_missing_letters',
      'student_vocab_categorize',
      'student_vocab_speed_tap',
      'student_character_builder',
      'student_vocab_image_mcq',
      'student_superhero_builder',
    ],
  },
  { id: 'grammar_builder', label: 'Grammar Builder', activityTypes: ['student_grammar_builder'] },
  {
    id: 'grammar_practice',
    label: 'Grammar Practice',
    activityTypes: [
      'student_grammar_drag_order',
      'student_grammar_mcq',
      'student_grammar_frequency',
      'student_grammar_complete',
      'student_grammar_error_fix',
      'student_grammar_make_question',
      'student_character_description',
      'student_character_story',
      'student_superhero_profile',
    ],
  },
  {
    id: 'speaking',
    label: 'Speaking Cards',
    activityTypes: [
      'student_speaking_cards',
      'student_selfie_capture',
      'student_alignment_reveal',
      'student_superhero_image_generate',
    ],
  },
  { id: 'challenge', label: 'Challenge Wheel', activityTypes: ['student_challenge_wheel'] },
  { id: 'exit', label: 'Exit Ticket', activityTypes: ['student_exit_poll'] },
]

export function getStudentSectionForActivityType(
  activityType: string
): StudentSectionId | null {
  for (const section of STUDENT_SECTIONS) {
    if (section.activityTypes.includes(activityType as StudentActivityType)) {
      return section.id
    }
  }
  return null
}
