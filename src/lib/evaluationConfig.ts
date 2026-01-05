export interface CEFRMapping {
  min: number;
  max: number;
  level: string;
}

export interface EvaluationQuestion {
  id: string;
  type: 'multiple_choice' | 'dropdown' | 'fill_blank' | 'drag_fill' | 'drag_match' | 'speaking';
  prompt: string;
  options?: string[];
  words?: string[]; // For drag_fill type
  correct: string;
  pairs?: { word: string; match: string }[];
  level: string;
  audio?: string;
}

export interface EvaluationSection {
  id: 'vocabulary' | 'grammar' | 'listening' | 'speaking';
  questionCount: number;
  questions: EvaluationQuestion[];
  scoring?: {
    pronunciation?: number;
    grammarAccuracy?: number;
    vocabularyRange?: number;
    fluency?: number;
  };
}

export interface EvaluationConfig {
  testId: string;
  targetDurationMinutes: number;
  cefrMapping: CEFRMapping[];
  scoringWeights: {
    vocabulary: number;
    grammar: number;
    listening: number;
    speaking: number;
  };
  sections: EvaluationSection[];
}

// CEFR Level mapping based on total score percentage
export const CEFR_MAPPING: CEFRMapping[] = [
  { min: 0, max: 20, level: 'Pre-A1' },
  { min: 21, max: 35, level: 'A1' },
  { min: 36, max: 50, level: 'A2' },
  { min: 51, max: 65, level: 'B1' },
  { min: 66, max: 80, level: 'B2' },
  { min: 81, max: 90, level: 'C1' },
  { min: 91, max: 100, level: 'C2' }
];

// Updated evaluation test configuration with vocabulary and grammar only
export const EVALUATION_CONFIG: EvaluationConfig = {
  testId: 'tutorcat-level-check-v2',
  targetDurationMinutes: 6,
  cefrMapping: CEFR_MAPPING,
  scoringWeights: {
    vocabulary: 0.3,    // 30%
    grammar: 0.3,       // 30%
    listening: 0,       // Removed
    speaking: 0.4       // 40%
  },
  sections: [
    {
      id: 'vocabulary',
      questionCount: 5,
      questions: [
        {
          id: 'vocab-1',
          type: 'multiple_choice',
          prompt: 'Choose the correct meaning of: exhausted',
          options: ['very tired', 'very happy', 'very fast', 'very angry'],
          correct: 'very tired',
          level: 'A2'
        },
        {
          id: 'vocab-2',
          type: 'multiple_choice',
          prompt: 'Choose the correct word: She ___ the meeting because she was sick.',
          options: ['missed', 'lost', 'forgot', 'escaped'],
          correct: 'missed',
          level: 'A2'
        },
        {
          id: 'vocab-3',
          type: 'drag_match',
          prompt: 'Match the word with its meaning',
          pairs: [
            { word: 'borrow', match: 'take with intention to return' },
            { word: 'lend', match: 'give temporarily' }
          ],
          correct: 'borrow:take with intention to return,lend:give temporarily',
          level: 'B1'
        },
        {
          id: 'vocab-4',
          type: 'multiple_choice',
          prompt: 'Which word is closest in meaning to \'improve\'?',
          options: ['make better', 'make worse', 'stop', 'repeat'],
          correct: 'make better',
          level: 'A1'
        },
        {
          id: 'vocab-5',
          type: 'fill_blank',
          prompt: 'I was ___ when I heard the news.',
          options: ['surprised', 'happy', 'sad', 'angry'],
          correct: 'surprised',
          level: 'A1'
        }
      ]
    },
    {
      id: 'grammar',
      questionCount: 5,
      questions: [
        {
          id: 'grammar-1',
          type: 'dropdown',
          prompt: 'Yesterday, I ___ to school.',
          options: ['go', 'went', 'going', 'gone'],
          correct: 'went',
          level: 'A1'
        },
        {
          id: 'grammar-2',
          type: 'dropdown',
          prompt: 'She has lived here ___ five years.',
          options: ['since', 'for', 'during', 'from'],
          correct: 'for',
          level: 'A2'
        },
        {
          id: 'grammar-3',
          type: 'drag_fill',
          prompt: 'If I ___ more time, I would travel more.',
          words: ['had', 'have', 'has', 'having'],
          correct: 'had',
          level: 'B1'
        },
        {
          id: 'grammar-4',
          type: 'dropdown',
          prompt: 'This is the ___ movie I have ever seen.',
          options: ['more interesting', 'most interesting', 'very interesting', 'much interesting'],
          correct: 'most interesting',
          level: 'A2'
        },
        {
          id: 'grammar-5',
          type: 'drag_fill',
          prompt: 'The report ___ by the manager yesterday.',
          words: ['was written', 'wrote', 'is written', 'has written'],
          correct: 'was written',
          level: 'B2'
        }
      ]
    },
    {
      id: 'speaking',
      questionCount: 2,
      scoring: {
        pronunciation: 0.35,
        grammarAccuracy: 0.25,
        vocabularyRange: 0.2,
        fluency: 0.2
      },
      questions: [
        {
          id: 'speaking-1',
          type: 'speaking',
          prompt: 'Describe your daily routine.',
          correct: '', // AI evaluated
          level: 'A2'
        },
        {
          id: 'speaking-2',
          type: 'speaking',
          prompt: 'Do you agree or disagree that technology makes life easier? Explain why.',
          correct: '', // AI evaluated
          level: 'B1'
        }
      ]
    }
  ]
};

// Function to calculate CEFR level from total percentage
export function calculateCEFRLevel(percentage: number): string {
  const mapping = CEFR_MAPPING.find(range => percentage >= range.min && percentage <= range.max);
  return mapping?.level || 'A1';
}

// Convert CEFR level to numeric value for comparison
const CEFR_LEVEL_VALUES: Record<string, number> = {
  'Pre-A1': 0,
  'A1': 1,
  'A2': 2,
  'B1': 3,
  'B2': 4,
  'C1': 5,
  'C2': 6
};

// Convert numeric value back to CEFR level
const CEFR_VALUES_TO_LEVEL: Record<number, string> = {
  0: 'Pre-A1',
  1: 'A1',
  2: 'A2',
  3: 'B1',
  4: 'B2',
  5: 'C1',
  6: 'C2'
};

// Function to find middle ground between two CEFR levels
export function findMiddleGroundLevel(level1: string, level2: string): string {
  const value1 = CEFR_LEVEL_VALUES[level1] ?? 1; // Default to A1 if invalid
  const value2 = CEFR_LEVEL_VALUES[level2] ?? 1; // Default to A1 if invalid
  
  // Calculate average and round to nearest integer
  const averageValue = Math.round((value1 + value2) / 2);
  
  // Ensure it's within valid range
  const clampedValue = Math.max(0, Math.min(6, averageValue));
  
  return CEFR_VALUES_TO_LEVEL[clampedValue] || 'A1';
}

// Function to get questions for a specific test type
export function getQuestionsForTest(testType: 'vocabulary' | 'grammar' | 'speaking'): EvaluationQuestion[] {
  const section = EVALUATION_CONFIG.sections.find(s => s.id === testType);
  return section?.questions || [];
}
