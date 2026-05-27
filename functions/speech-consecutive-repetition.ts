/** Detect padding: same word 3+ times in a row, or same phrase repeated back-to-back. */

export const CONSECUTIVE_REPETITION_ERROR_MSG =
  "Don't repeat the same word or phrase to make your answer longer. Say your answer in your own words, then record again.";

const WORD_STREAK_MIN = 3;
const PHRASE_LEN_MIN = 2;
/** Long enough to catch repeated sentences/clauses (e.g. "I would like to be able to…" × N). */
const PHRASE_LEN_MAX = 24;

export type ConsecutiveRepetitionHit = {
  kind: 'word' | 'phrase';
  repeated: string;
};

export function tokenizeTranscript(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function detectConsecutiveRepetition(transcript: string): ConsecutiveRepetitionHit | null {
  const tokens = tokenizeTranscript(transcript);
  if (tokens.length < WORD_STREAK_MIN) return null;

  let streak = 1;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i] === tokens[i - 1]) {
      streak++;
      if (streak >= WORD_STREAK_MIN) {
        return { kind: 'word', repeated: tokens[i] };
      }
    } else {
      streak = 1;
    }
  }

  const maxPhraseLen = Math.min(PHRASE_LEN_MAX, Math.floor(tokens.length / 2));
  for (let phraseLen = PHRASE_LEN_MIN; phraseLen <= maxPhraseLen; phraseLen++) {
    for (let i = 0; i + phraseLen * 2 <= tokens.length; i++) {
      const phrase1 = tokens.slice(i, i + phraseLen).join(' ');
      const phrase2 = tokens.slice(i + phraseLen, i + phraseLen * 2).join(' ');
      if (phrase1 === phrase2) {
        const display =
          phraseLen > 8 ? `${tokens.slice(i, i + 8).join(' ')}…` : phrase1;
        return { kind: 'phrase', repeated: display };
      }
    }
  }

  return null;
}
