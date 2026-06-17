/** Admin robot-detect calibration: speaking prompts grouped by topic. */

export const ADMIN_TTS_CHECK_LESSON_ID = 'admin-tts-check'

export function adminTtsCheckLessonId(sessionId: string): string {
  return `${ADMIN_TTS_CHECK_LESSON_ID}:${sessionId}`
}

export function isAdminTtsCheckLessonId(lessonId: string | null | undefined): boolean {
  return typeof lessonId === 'string' && lessonId.startsWith(`${ADMIN_TTS_CHECK_LESSON_ID}`)
}

export type AdminTtsCheckTopic = {
  id: string
  title: string
  prompts: { id: string; text: string }[]
}

export const ADMIN_TTS_CHECK_TOPICS: AdminTtsCheckTopic[] = [
  {
    id: 'family-home',
    title: 'Family & Home',
    prompts: [
      { id: 'family-1', text: 'Tell me about your family. Who do you live with?' },
      { id: 'family-2', text: 'Describe your home or your favorite room.' },
      { id: 'family-3', text: 'What do you usually do with your family on weekends?' },
      { id: 'family-4', text: 'Who in your family are you closest to, and why?' },
    ],
  },
  {
    id: 'school-learning',
    title: 'School & Learning',
    prompts: [
      { id: 'school-1', text: 'What is your favorite subject at school? Why?' },
      { id: 'school-2', text: 'Describe a teacher who helped you learn something important.' },
      { id: 'school-3', text: 'What do you do after school on a typical day?' },
      { id: 'school-4', text: 'Tell me about a project or assignment you enjoyed.' },
    ],
  },
  {
    id: 'food-cooking',
    title: 'Food & Cooking',
    prompts: [
      { id: 'food-1', text: 'What is your favorite food? How often do you eat it?' },
      { id: 'food-2', text: 'Describe a meal you cooked or helped prepare.' },
      { id: 'food-3', text: 'What food from your country would you recommend to a visitor?' },
      { id: 'food-4', text: 'Do you prefer eating at home or at restaurants? Why?' },
    ],
  },
  {
    id: 'hobbies-free-time',
    title: 'Hobbies & Free Time',
    prompts: [
      { id: 'hobby-1', text: 'What hobbies do you enjoy in your free time?' },
      { id: 'hobby-2', text: 'Describe a sport or game you like to play.' },
      { id: 'hobby-3', text: 'What did you do last weekend for fun?' },
      { id: 'hobby-4', text: 'If you had a full day off, how would you spend it?' },
    ],
  },
  {
    id: 'travel-places',
    title: 'Travel & Places',
    prompts: [
      { id: 'travel-1', text: 'Describe a place you have visited and liked.' },
      { id: 'travel-2', text: 'What is your favorite place in your city or town?' },
      { id: 'travel-3', text: 'Where would you like to travel next, and why?' },
      { id: 'travel-4', text: 'Tell me about public transport where you live.' },
    ],
  },
  {
    id: 'technology-internet',
    title: 'Technology & Internet',
    prompts: [
      { id: 'tech-1', text: 'How do you use your phone or computer every day?' },
      { id: 'tech-2', text: 'What apps or websites do you use most often?' },
      { id: 'tech-3', text: 'Describe something new you learned to do online recently.' },
      { id: 'tech-4', text: 'Do you think technology makes life easier? Explain why.' },
    ],
  },
  {
    id: 'health-fitness',
    title: 'Health & Fitness',
    prompts: [
      { id: 'health-1', text: 'What do you do to stay healthy?' },
      { id: 'health-2', text: 'Describe your exercise routine or physical activity.' },
      { id: 'health-3', text: 'What healthy food do you try to eat regularly?' },
      { id: 'health-4', text: 'Tell me about a time you felt very tired or very energetic.' },
    ],
  },
  {
    id: 'weather-seasons',
    title: 'Weather & Seasons',
    prompts: [
      { id: 'weather-1', text: 'What is the weather like today where you are?' },
      { id: 'weather-2', text: 'Which season do you like best in your country?' },
      { id: 'weather-3', text: 'How does the weather change what you wear or do?' },
      { id: 'weather-4', text: 'Describe a memorable day with unusual weather.' },
    ],
  },
  {
    id: 'shopping-money',
    title: 'Shopping & Money',
    prompts: [
      { id: 'shop-1', text: 'Where do you usually go shopping in your area?' },
      { id: 'shop-2', text: 'Describe something you bought recently and why.' },
      { id: 'shop-3', text: 'Do you prefer shopping online or in stores? Why?' },
      { id: 'shop-4', text: 'How do you decide whether something is worth the price?' },
    ],
  },
  {
    id: 'friends-social',
    title: 'Friends & Social Life',
    prompts: [
      { id: 'social-1', text: 'Tell me about your best friend.' },
      { id: 'social-2', text: 'How do you usually meet new people?' },
      { id: 'social-3', text: 'Describe a celebration or party you attended.' },
      { id: 'social-4', text: 'What qualities do you look for in a good friend?' },
    ],
  },
]

export type AdminTtsDeliveryMethod =
  | 'human_mic'
  | 'google_translate_tts'
  | 'ai_voice_tts'
  | 'speaker_playback'

export const ADMIN_TTS_DELIVERY_OPTIONS: { value: AdminTtsDeliveryMethod; label: string }[] = [
  { value: 'human_mic', label: 'Human microphone (natural speech)' },
  { value: 'google_translate_tts', label: 'Google Translate TTS (read aloud)' },
  { value: 'ai_voice_tts', label: 'AI voice / ChatGPT TTS' },
  { value: 'speaker_playback', label: 'Speaker playback (phone/laptop speaker → mic)' },
]

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function pickRandomTopic(): AdminTtsCheckTopic {
  const topics = ADMIN_TTS_CHECK_TOPICS
  return topics[Math.floor(Math.random() * topics.length)]
}

export function pickRandomPromptsFromTopic(topic: AdminTtsCheckTopic, count = 3) {
  return shuffle(topic.prompts).slice(0, Math.min(count, topic.prompts.length))
}

export function buildAdminTtsPromptId(topicId: string, promptId: string): string {
  return `${topicId}/${promptId}`
}
