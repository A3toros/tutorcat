/** Lesson 4 — Which hero are you? quiz (precoded, no AI). Content mirrored in seed migration. */

import { portraitUrlForHero } from '@/lib/superheroPortraits'

export type GenderPool = 'boy' | 'girl'

export type HeroId =
  | 'aquaman'
  | 'peacemaker'
  | 'superman'
  | 'batman'
  | 'joker'
  | 'wonder_woman'
  | 'supergirl'
  | 'batgirl'
  | 'catwoman'
  | 'harley_quinn'

export interface QuizOption {
  id: string
  label: string
  gender_pool?: GenderPool
  weights?: Partial<Record<GenderPool, Partial<Record<HeroId, number>>>>
}

export interface QuizQuestion {
  id: string
  prompt: string
  options: QuizOption[]
}

export interface QuizHero {
  name: string
  gender: GenderPool
  image_url: string
  emoji: string
  why: string
}

export interface SuperheroQuizContent {
  gender_question_id: string
  tie_break_order: HeroId[]
  heroes: Record<HeroId, QuizHero>
  questions: QuizQuestion[]
}

export const BOY_HEROES: HeroId[] = ['aquaman', 'peacemaker', 'superman', 'batman', 'joker']
export const GIRL_HEROES: HeroId[] = [
  'wonder_woman',
  'supergirl',
  'batgirl',
  'catwoman',
  'harley_quinn',
]

export const LESSON4_SUPERHERO_QUIZ: SuperheroQuizContent = {
  gender_question_id: 'q1_gender',
  tie_break_order: [
    'superman',
    'batman',
    'wonder_woman',
    'batgirl',
    'aquaman',
    'supergirl',
    'peacemaker',
    'catwoman',
    'joker',
    'harley_quinn',
  ],
  heroes: {
    aquaman: {
      name: 'Aquaman',
      gender: 'boy',
      image_url: portraitUrlForHero('aquaman'),
      emoji: '🌊',
      why: 'You are like Aquaman because you love the ocean and you are loyal. You protect your friends and your home.',
    },
    peacemaker: {
      name: 'Peacemaker',
      gender: 'boy',
      image_url: portraitUrlForHero('peacemaker'),
      emoji: '🕊️',
      why: 'You are like Peacemaker because you are funny and unpredictable. You want peace, but your plans are sometimes very strange!',
    },
    superman: {
      name: 'Superman',
      gender: 'boy',
      image_url: portraitUrlForHero('superman'),
      emoji: '🦸',
      why: 'You are like Superman because you are honest, helpful, and brave. You want to protect people and do the right thing — even when it is hard.',
    },
    batman: {
      name: 'Batman',
      gender: 'boy',
      image_url: portraitUrlForHero('batman'),
      emoji: '🦇',
      why: 'You are like Batman because you are smart and serious. You make plans, work at night, and never give up on justice.',
    },
    joker: {
      name: 'Joker',
      gender: 'boy',
      image_url: portraitUrlForHero('joker'),
      emoji: '🃏',
      why: 'You are like Joker because you love fun and chaos. You do not always follow rules, and people never know what you will do next.',
    },
    wonder_woman: {
      name: 'Wonder Woman',
      gender: 'girl',
      image_url: portraitUrlForHero('wonder_woman'),
      emoji: '⚔️',
      why: 'You are like Wonder Woman because you are brave, fair, and kind. You stand up for people and fight for what is right.',
    },
    supergirl: {
      name: 'Supergirl',
      gender: 'girl',
      image_url: portraitUrlForHero('supergirl'),
      emoji: '🦸‍♀️',
      why: 'You are like Supergirl because you are hopeful and strong. You fly high, help friends quickly, and believe in the good in people.',
    },
    batgirl: {
      name: 'Batgirl',
      gender: 'girl',
      image_url: portraitUrlForHero('batgirl'),
      emoji: '🦇',
      why: 'You are like Batgirl because you are clever and brave. You use your brain, learn fast, and help your city at night.',
    },
    catwoman: {
      name: 'Catwoman',
      gender: 'girl',
      image_url: portraitUrlForHero('catwoman'),
      emoji: '🐱',
      why: 'You are like Catwoman because you are independent and sneaky. You follow your own rules and do things your way.',
    },
    harley_quinn: {
      name: 'Harley Quinn',
      gender: 'girl',
      image_url: portraitUrlForHero('harley_quinn'),
      emoji: '🎭',
      why: 'You are like Harley Quinn because you are fun, wild, and loyal. You love excitement and you are not afraid to be different.',
    },
  },
  questions: [
    {
      id: 'q1_gender',
      prompt: 'Are you a boy or a girl?',
      options: [
        { id: 'boy', label: 'I am a boy.', gender_pool: 'boy' },
        { id: 'girl', label: 'I am a girl.', gender_pool: 'girl' },
      ],
    },
    {
      id: 'q2_help',
      prompt: 'When a friend needs help, what do you do?',
      options: [
        {
          id: 'a',
          label: 'I run to help right away.',
          weights: { boy: { superman: 2, aquaman: 1 }, girl: { wonder_woman: 2, supergirl: 2 } },
        },
        {
          id: 'b',
          label: 'I make a plan first, then help.',
          weights: { boy: { batman: 2, peacemaker: 1 }, girl: { batgirl: 2, wonder_woman: 1 } },
        },
        {
          id: 'c',
          label: 'I ask questions and learn more.',
          weights: { boy: { batman: 2, superman: 1 }, girl: { batgirl: 2, catwoman: 1 } },
        },
        {
          id: 'd',
          label: 'I wait and see what happens.',
          weights: { boy: { peacemaker: 2, joker: 1 }, girl: { harley_quinn: 2, catwoman: 1 } },
        },
      ],
    },
    {
      id: 'q3_place',
      prompt: 'Which place sounds best to you?',
      options: [
        {
          id: 'a',
          label: 'The ocean or the beach.',
          weights: { boy: { aquaman: 3 }, girl: { wonder_woman: 1, supergirl: 1 } },
        },
        {
          id: 'b',
          label: 'A dark city at night.',
          weights: { boy: { batman: 3 }, girl: { batgirl: 2, catwoman: 2 } },
        },
        {
          id: 'c',
          label: 'High in the sky.',
          weights: { boy: { superman: 3 }, girl: { supergirl: 3 } },
        },
        {
          id: 'd',
          label: 'A fun fair or party.',
          weights: { boy: { joker: 2, peacemaker: 2 }, girl: { harley_quinn: 3 } },
        },
      ],
    },
    {
      id: 'q4_rules',
      prompt: 'How do you feel about rules?',
      options: [
        {
          id: 'a',
          label: 'Rules keep people safe.',
          weights: { boy: { superman: 3 }, girl: { wonder_woman: 3 } },
        },
        {
          id: 'b',
          label: 'I follow rules, but I am flexible.',
          weights: { boy: { batman: 2, aquaman: 1 }, girl: { batgirl: 2, supergirl: 1 } },
        },
        {
          id: 'c',
          label: 'Rules are boring — fun is better.',
          weights: { boy: { joker: 3 }, girl: { harley_quinn: 2, catwoman: 1 } },
        },
        {
          id: 'd',
          label: 'I only follow rules I agree with.',
          weights: { boy: { peacemaker: 3 }, girl: { catwoman: 3 } },
        },
      ],
    },
    {
      id: 'q5_strength',
      prompt: 'What is your greatest strength?',
      options: [
        {
          id: 'a',
          label: 'I am very strong.',
          weights: {
            boy: { superman: 2, aquaman: 2 },
            girl: { wonder_woman: 2, supergirl: 2 },
          },
        },
        {
          id: 'b',
          label: 'I am very smart.',
          weights: { boy: { batman: 3 }, girl: { batgirl: 3 } },
        },
        {
          id: 'c',
          label: 'I am very brave.',
          weights: { boy: { superman: 1, aquaman: 2 }, girl: { wonder_woman: 3 } },
        },
        {
          id: 'd',
          label: 'I am very funny.',
          weights: { boy: { peacemaker: 2, joker: 2 }, girl: { harley_quinn: 3 } },
        },
      ],
    },
    {
      id: 'q6_problems',
      prompt: 'How do you solve problems?',
      options: [
        {
          id: 'a',
          label: 'I talk and try to be kind.',
          weights: { boy: { superman: 2, aquaman: 1 }, girl: { wonder_woman: 2, supergirl: 2 } },
        },
        {
          id: 'b',
          label: 'I train hard and fight if I must.',
          weights: { boy: { batman: 2, superman: 1 }, girl: { batgirl: 2, wonder_woman: 1 } },
        },
        {
          id: 'c',
          label: 'I trick my enemy.',
          weights: { boy: { joker: 3 }, girl: { catwoman: 3 } },
        },
        {
          id: 'd',
          label: 'I try a strange or surprising plan.',
          weights: { boy: { peacemaker: 3 }, girl: { harley_quinn: 2, catwoman: 1 } },
        },
      ],
    },
    {
      id: 'q7_friends',
      prompt: 'What do your friends say about you?',
      options: [
        {
          id: 'a',
          label: '"You are so honest."',
          weights: { boy: { superman: 3 }, girl: { supergirl: 2, wonder_woman: 1 } },
        },
        {
          id: 'b',
          label: '"You are so mysterious."',
          weights: { boy: { batman: 3 }, girl: { batgirl: 1, catwoman: 2 } },
        },
        {
          id: 'c',
          label: '"You are so loyal."',
          weights: { boy: { aquaman: 3 }, girl: { wonder_woman: 2, harley_quinn: 1 } },
        },
        {
          id: 'd',
          label: '"You are a little dangerous."',
          weights: { boy: { joker: 2, peacemaker: 1 }, girl: { harley_quinn: 2, catwoman: 2 } },
        },
      ],
    },
    {
      id: 'q8_unfair',
      prompt: 'Something unfair happens. You…',
      options: [
        {
          id: 'a',
          label: 'Stop it immediately.',
          weights: { boy: { superman: 3 }, girl: { wonder_woman: 3 } },
        },
        {
          id: 'b',
          label: 'Watch, think, then act.',
          weights: { boy: { batman: 3 }, girl: { batgirl: 3 } },
        },
        {
          id: 'c',
          label: 'Laugh or walk away.',
          weights: { boy: { joker: 3 }, girl: { harley_quinn: 2, catwoman: 1 } },
        },
        {
          id: 'd',
          label: 'Try a weird plan that might work.',
          weights: { boy: { peacemaker: 3 }, girl: { harley_quinn: 2, supergirl: 1 } },
        },
      ],
    },
    {
      id: 'q9_power',
      prompt: 'Pick a superpower.',
      options: [
        {
          id: 'a',
          label: 'Super strength.',
          weights: {
            boy: { superman: 2, aquaman: 1 },
            girl: { wonder_woman: 2, supergirl: 1 },
          },
        },
        {
          id: 'b',
          label: 'Fly.',
          weights: { boy: { superman: 3 }, girl: { supergirl: 3 } },
        },
        {
          id: 'c',
          label: 'Talk to sea animals.',
          weights: { boy: { aquaman: 3 }, girl: { wonder_woman: 1 } },
        },
        {
          id: 'd',
          label: 'Sneak and disappear.',
          weights: { boy: { batman: 2, joker: 1 }, girl: { batgirl: 2, catwoman: 2 } },
        },
      ],
    },
    {
      id: 'q10_kind',
      prompt: 'What kind of hero are you?',
      options: [
        {
          id: 'a',
          label: 'A classic hero everyone trusts.',
          weights: { boy: { superman: 3 }, girl: { supergirl: 2, wonder_woman: 1 } },
        },
        {
          id: 'b',
          label: 'A dark hero with secrets.',
          weights: { boy: { batman: 3 }, girl: { batgirl: 2, catwoman: 1 } },
        },
        {
          id: 'c',
          label: 'A wild card — you never know.',
          weights: { boy: { joker: 2, peacemaker: 2 }, girl: { harley_quinn: 3 } },
        },
        {
          id: 'd',
          label: 'A free spirit — I do things my way.',
          weights: { boy: { aquaman: 2, peacemaker: 1 }, girl: { catwoman: 3 } },
        },
      ],
    },
  ],
}

const LATE_QUESTION_IDS = new Set(['q8_unfair', 'q9_power', 'q10_kind'])

function poolHeroes(pool: GenderPool): HeroId[] {
  return pool === 'boy' ? BOY_HEROES : GIRL_HEROES
}

function initScores(pool: GenderPool): Record<string, number> {
  return Object.fromEntries(poolHeroes(pool).map((id) => [id, 0]))
}

function genderFromResponse(
  content: SuperheroQuizContent,
  responses: Record<string, string>
): GenderPool | null {
  const q1 = content.questions.find((q) => q.id === content.gender_question_id)
  const answerId = responses[content.gender_question_id]
  if (!q1 || !answerId) return null
  const opt = q1.options.find((o) => o.id === answerId)
  return opt?.gender_pool ?? null
}

export function parseQuizContent(raw: Record<string, unknown> | undefined): SuperheroQuizContent {
  if (!raw?.questions || !Array.isArray(raw.questions) || raw.questions.length === 0) {
    return LESSON4_SUPERHERO_QUIZ
  }
  return raw as unknown as SuperheroQuizContent
}

export interface QuizMatchResult {
  gender_pool: GenderPool
  scores: Record<string, number>
  matched_hero_id: HeroId
  matched_hero_name: string
  match_why: string
  image_url: string
  emoji: string
}

export function computeHeroMatch(
  content: SuperheroQuizContent,
  responses: Record<string, string>
): QuizMatchResult | null {
  const pool = genderFromResponse(content, responses)
  if (!pool) return null

  const scores = initScores(pool)

  for (const question of content.questions) {
    if (question.id === content.gender_question_id) continue
    const answerId = responses[question.id]
    if (!answerId) continue
    const option = question.options.find((o) => o.id === answerId)
    const weights = option?.weights?.[pool]
    if (!weights) continue
    for (const [heroId, pts] of Object.entries(weights)) {
      if (heroId in scores && typeof pts === 'number') {
        scores[heroId] += pts
      }
    }
  }

  const heroesInPool = poolHeroes(pool)
  let bestScore = -1
  let candidates: HeroId[] = []

  for (const heroId of heroesInPool) {
    const s = scores[heroId] ?? 0
    if (s > bestScore) {
      bestScore = s
      candidates = [heroId]
    } else if (s === bestScore) {
      candidates.push(heroId)
    }
  }

  if (candidates.length === 1) {
    return buildResult(content, pool, scores, candidates[0])
  }

  const lateBoost = initScores(pool)
  for (const question of content.questions) {
    if (!LATE_QUESTION_IDS.has(question.id)) continue
    const answerId = responses[question.id]
    const option = question.options.find((o) => o.id === answerId)
    const weights = option?.weights?.[pool]
    if (!weights) continue
    for (const heroId of candidates) {
      const pts = weights[heroId as HeroId]
      if (typeof pts === 'number') lateBoost[heroId] += pts
    }
  }

  let tieBest = -1
  let tieCandidates: HeroId[] = []
  for (const heroId of candidates) {
    const lb = lateBoost[heroId] ?? 0
    if (lb > tieBest) {
      tieBest = lb
      tieCandidates = [heroId]
    } else if (lb === tieBest) {
      tieCandidates.push(heroId)
    }
  }

  if (tieCandidates.length === 1) {
    return buildResult(content, pool, scores, tieCandidates[0])
  }

  const q10 = content.questions.find((q) => q.id === 'q10_kind')
  const q10Answer = responses.q10_kind
  const q10Opt = q10?.options.find((o) => o.id === q10Answer)
  const q10Weights = q10Opt?.weights?.[pool]
  if (q10Weights) {
    let q10Best = -1
    let q10Winner: HeroId | null = null
    for (const heroId of tieCandidates) {
      const w = q10Weights[heroId] ?? 0
      if (w > q10Best) {
        q10Best = w
        q10Winner = heroId
      }
    }
    if (q10Winner) return buildResult(content, pool, scores, q10Winner)
  }

  const order = content.tie_break_order.filter((id) => tieCandidates.includes(id))
  const winner = order[0] ?? tieCandidates[0]
  return buildResult(content, pool, scores, winner)
}

function buildResult(
  content: SuperheroQuizContent,
  pool: GenderPool,
  scores: Record<string, number>,
  heroId: HeroId
): QuizMatchResult {
  const hero = content.heroes[heroId]
  return {
    gender_pool: pool,
    scores,
    matched_hero_id: heroId,
    matched_hero_name: hero.name,
    match_why: hero.why,
    image_url: portraitUrlForHero(heroId),
    emoji: hero.emoji,
  }
}
