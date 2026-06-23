import {
  computeHeroMatch,
  LESSON4_SUPERHERO_QUIZ,
} from '../src/lib/lesson4SuperheroQuiz'

describe('lesson4SuperheroQuiz', () => {
  it('matches supergirl for hopeful girl answers', () => {
    const responses = {
      q1_gender: 'girl',
      q2_help: 'a',
      q3_place: 'c',
      q4_rules: 'a',
      q5_strength: 'a',
      q6_problems: 'a',
      q7_friends: 'a',
      q8_unfair: 'a',
      q9_power: 'b',
      q10_kind: 'a',
    }
    const result = computeHeroMatch(LESSON4_SUPERHERO_QUIZ, responses)
    expect(result?.matched_hero_id).toBe('supergirl')
    expect(result?.gender_pool).toBe('girl')
  })

  it('matches batman for planning boy answers', () => {
    const responses = {
      q1_gender: 'boy',
      q2_help: 'b',
      q3_place: 'b',
      q4_rules: 'b',
      q5_strength: 'b',
      q6_problems: 'b',
      q7_friends: 'b',
      q8_unfair: 'b',
      q9_power: 'd',
      q10_kind: 'b',
    }
    const result = computeHeroMatch(LESSON4_SUPERHERO_QUIZ, responses)
    expect(result?.matched_hero_id).toBe('batman')
  })
})
