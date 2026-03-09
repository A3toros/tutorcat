import React, { useState, useCallback, memo, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../../ui/Button';
import Card from '../../ui/Card';

// Fisher-Yates shuffle algorithm
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

interface Blank {
  id: string;
  text: string;
  options: string[];
  correctAnswer: string | number;
}

interface VocabularyFillBlanksData {
  lessonId: string;
  activityOrder: number;
  exerciseNumber?: number; // Optional: exercise number (1, 2, 3, etc.) for multiple exercises
  text?: string;
  blanks?: Blank[];
  sentence?: string;
  options?: string[];
  correct?: number;
}

interface VocabularyFillBlanksProps {
  lessonData: VocabularyFillBlanksData;
  onComplete: (result?: any) => void;
}

const VocabularyFillBlanks = memo<VocabularyFillBlanksProps>(({ lessonData, onComplete }) => {
  const { t } = useTranslation();
  const [hasCalledOnComplete, setHasCalledOnComplete] = useState(false);
  const hasCalledOnCompleteRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Log on mount to verify component is rendered
  useEffect(() => {
    // Debug logging for component mounting
    console.warn('🟢 VocabularyFillBlanks: Component mounted', {
      activityOrder: lessonData.activityOrder,
      hasOnComplete: !!onComplete
    });
  }, [lessonData.activityOrder, onComplete]);

  // Parse sentence to extract blanks (supports both ___ and [BLANK_X] formats)
  const parseSentenceWithBlanks = useCallback((sentence: string, options: string[]) => {
    // Check if sentence has ___ placeholders
    const blankMatches = sentence.match(/___+/g);
    if (!blankMatches || blankMatches.length === 0) {
      return null;
    }

    // Create blanks array from placeholders
    const blanks: Blank[] = blankMatches.map((_, index) => ({
      id: `blank-${index}`,
      text: '',
      options: options,
      correctAnswer: index < options.length ? options[index] : ''
    }));

    return { text: sentence, blanks };
  }, []);

  // Determine data format
  const hasBlanksArray = lessonData.blanks && lessonData.blanks.length > 0;
  const hasTextWithBlanks = lessonData.text && lessonData.blanks && lessonData.blanks.length > 0;
  const hasSentenceWithOptions = lessonData.sentence && lessonData.options && lessonData.options.length > 0;

  let text = '';
  let blanks: Blank[] = [];

  if (hasTextWithBlanks) {
    // Format: text + blanks array (from database)
    text = lessonData.text || '';
    blanks = lessonData.blanks || [];
  } else if (hasBlanksArray) {
    // Format: just blanks array
    text = lessonData.text || '';
    blanks = lessonData.blanks || [];
  } else if (hasSentenceWithOptions) {
    // Format: sentence with ___ and options array (need to parse)
    const parsed = parseSentenceWithBlanks(lessonData.sentence!, lessonData.options!);
    if (parsed) {
      text = parsed.text;
      blanks = parsed.blanks;
    } else {
      // Fallback: treat as single question
      text = lessonData.sentence!;
      blanks = [];
    }
  }

  // Debug: Log the raw blanks data to see what we're working with
  useEffect(() => {
    if (blanks.length > 0) {
      console.warn('🔍 VocabularyFillBlanks: Raw blanks data', {
        blanksCount: blanks.length,
        blanks: blanks.map(blank => ({
          id: blank.id,
          correctAnswer: blank.correctAnswer,
          correctAnswerType: typeof blank.correctAnswer,
          options: blank.options,
          optionsLength: blank.options?.length,
          correctAnswerInOptions: blank.options?.includes(blank.correctAnswer as string),
          correctAnswerInOptionsStrict: blank.options?.some(opt => opt === blank.correctAnswer)
        }))
      });
    }
  }, [blanks]);

  const isSingleQuestion = blanks.length === 0 && (lessonData.sentence || lessonData.text);
  const singleSentence = lessonData.sentence || lessonData.text || '';
  const singleOptions = lessonData.options || [];
  const singleCorrect = lessonData.correct !== undefined ? lessonData.correct : -1;

  // Normalize string for comparison (handles hyphens, whitespace, encoding issues)
  const normalizeString = useCallback((str: string): string => {
    if (!str) return '';
    return str
      .trim()
      // Normalize different hyphen characters to regular hyphen
      .replace(/[\u2011\u2013\u2014\u2212]/g, '-')
      // Normalize multiple spaces to single space
      .replace(/\s+/g, ' ');
  }, []);

  // Shuffle options for each blank to randomize the order
  const shuffledBlanks = useMemo(() => {
    return blanks.map(blank => {
      // Safety check: ensure options is an array and not empty
      if (!blank.options || !Array.isArray(blank.options) || blank.options.length === 0) {
        console.error('❌ VocabularyFillBlanks: Blank has no options', { blank });
        return {
          ...blank,
          options: [],
          correctAnswer: blank.correctAnswer
        };
      }

      const shuffledOptions = shuffleArray(blank.options);
      // Normalize the correct answer for comparison
      const normalizedCorrectAnswer = typeof blank.correctAnswer === 'string' 
        ? normalizeString(blank.correctAnswer) 
        : blank.correctAnswer;
      
      // Find the index of the correct answer in the shuffled array (with normalization)
      let correctAnswerIndex = shuffledOptions.findIndex(opt => {
        if (!opt) return false; // Skip empty/null options
        const normalizedOpt = normalizeString(opt);
        return normalizedOpt === normalizedCorrectAnswer || opt === blank.correctAnswer;
      });
      
      // If not found with strict comparison, try normalized comparison
      if (correctAnswerIndex === -1 && typeof blank.correctAnswer === 'string') {
        // Try to find by normalized value
        correctAnswerIndex = shuffledOptions.findIndex(opt => {
          if (!opt) return false;
          return normalizeString(opt) === normalizedCorrectAnswer;
        });
        
        // Debug logging when findIndex returns -1 even after normalization
        if (correctAnswerIndex === -1) {
          console.warn('⚠️ VocabularyFillBlanks: correctAnswer not found in options (even after normalization)', {
            blankId: blank.id,
            correctAnswer: blank.correctAnswer,
            correctAnswerLength: blank.correctAnswer.length,
            correctAnswerCharCodes: Array.from(blank.correctAnswer).map(c => c.charCodeAt(0)),
            normalizedCorrectAnswer,
            options: shuffledOptions,
            optionsCharCodes: shuffledOptions.map(opt => ({
              value: opt,
              length: opt?.length,
              codes: opt ? Array.from(opt).map(c => c.charCodeAt(0)) : []
            })),
            normalizedOptions: shuffledOptions.map(opt => opt ? normalizeString(opt) : ''),
            // Check if any option matches when normalized
            anyMatchAfterNormalization: shuffledOptions.some(opt => opt && normalizeString(opt) === normalizedCorrectAnswer)
          });
        } else {
          console.warn('✅ VocabularyFillBlanks: correctAnswer found after normalization (encoding issue fixed)', {
            blankId: blank.id,
            correctAnswer: blank.correctAnswer,
            foundAtIndex: correctAnswerIndex
          });
        }
      }
      
      return {
        ...blank,
        options: shuffledOptions,
        correctAnswer: correctAnswerIndex >= 0 ? correctAnswerIndex : blank.correctAnswer
      };
    });
  }, [blanks, normalizeString]);

  // Shuffle single question options
  const shuffledSingleOptions = useMemo(() => {
    if (singleOptions.length === 0) return { options: [], correctIndex: -1 };
    const shuffled = shuffleArray(singleOptions);
    // Find the index of the correct answer in the shuffled array
    const correctAnswer = singleOptions[singleCorrect];
    const newCorrectIndex = shuffled.findIndex(opt => opt === correctAnswer);
    return { options: shuffled, correctIndex: newCorrectIndex >= 0 ? newCorrectIndex : singleCorrect };
  }, [singleOptions, singleCorrect]);

  const [answers, setAnswers] = useState<{[key: string]: string}>({});
  const [singleAnswer, setSingleAnswer] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const [startTime] = useState(Date.now());

  // Handle answer selection for single question format
  const handleSingleAnswer = useCallback((answer: string) => {
    setSingleAnswer(answer);
    // Clear error message when user makes a new selection
    setErrorMessage(null);
  }, []);

  // Handle answer selection for multiple blanks format (inline mode)
  const handleAnswerSelect = useCallback((blankId: string, answer: string) => {
    setAnswers(prev => ({
      ...prev,
      [blankId]: answer
    }));
    setShowDropdown(null);
    // Clear error message when user makes a new selection
    setErrorMessage(null);
  }, []);

  // Calculate completion status
  const getCompletionStatus = useCallback(() => {
    if (isSingleQuestion) {
      const correctAnswer = shuffledSingleOptions.options[shuffledSingleOptions.correctIndex];
      return {
        total: 1,
        answered: singleAnswer ? 1 : 0,
        correct: singleAnswer && correctAnswer === singleAnswer ? 1 : 0,
        percentage: singleAnswer ? 100 : 0,
        isComplete: !!singleAnswer
      };
    }

    const total = shuffledBlanks.length;
    const answered = Object.keys(answers).length;
    const correct = shuffledBlanks.filter(blank => {
      const userAnswer = answers[blank.id];
      if (!userAnswer) return false;
      
      if (typeof blank.correctAnswer === 'number') {
        const correctOption = blank.options[blank.correctAnswer];
        // Normalize both for comparison
        return normalizeString(userAnswer) === normalizeString(correctOption) || userAnswer === correctOption;
      }
      
      // Normalize both strings for comparison (handles hyphen/whitespace differences)
      const normalizedUserAnswer = normalizeString(userAnswer);
      const normalizedCorrectAnswer = normalizeString(String(blank.correctAnswer));
      return normalizedUserAnswer === normalizedCorrectAnswer || userAnswer === blank.correctAnswer;
    }).length;

    return {
      total,
      answered,
      correct,
      percentage: total > 0 ? Math.round((answered / total) * 100) : 0,
      isComplete: answered === total
    };
  }, [answers, shuffledBlanks, isSingleQuestion, singleAnswer, shuffledSingleOptions, normalizeString]);

  // Handle completion - call onComplete immediately, parent handles background save
  const handleComplete = useCallback(() => {
    console.warn('🔵 VocabularyFillBlanks: handleComplete called', {
      hasCalledOnComplete,
      hasCalledOnCompleteRef: hasCalledOnCompleteRef.current,
      activityOrder: lessonData.activityOrder
    });

    if (hasCalledOnComplete || hasCalledOnCompleteRef.current) {
      console.warn('⚠️ VocabularyFillBlanks: Already called onComplete, ignoring');
      return;
    }

    const completion = getCompletionStatus();
    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    // Validate all answers are correct before proceeding
    if (completion.correct < completion.total) {
      // Some answers are incorrect - show error and reset
      setErrorMessage('Some answers are incorrect. Please try again.');
      // Reset all answers
      if (isSingleQuestion) {
        setSingleAnswer('');
      } else {
        setAnswers({});
      }
      return; // Don't complete, let user try again
    }

    // All answers are correct - proceed with completion
    setHasCalledOnComplete(true);
    hasCalledOnCompleteRef.current = true;
    setErrorMessage(null);

    console.warn('✅ VocabularyFillBlanks: Calling onComplete with result', {
      activityId: `vocabulary-fill-blanks-${lessonData.activityOrder}`,
      activityType: 'vocabulary_fill_blanks',
      activityOrder: lessonData.activityOrder,
      score: completion.correct,
      maxScore: completion.total,
      timeSpent
    });

    // Pass result object to onComplete - parent will handle background save
    const result = {
      activityId: `vocabulary-fill-blanks-${lessonData.activityOrder}`,
      activityType: 'vocabulary_fill_blanks',
      activityOrder: lessonData.activityOrder,
      score: completion.correct,
      maxScore: completion.total,
      attempts: 1,
      timeSpent,
      completedAt: new Date().toISOString(),
      answers: isSingleQuestion ? { answer: singleAnswer } : answers
    };

    console.warn('📤 VocabularyFillBlanks: Calling onComplete callback', result);
    onComplete(result);
    console.warn('✅ VocabularyFillBlanks: onComplete callback returned');

    // Safety timeout: if progression doesn't happen within 2 seconds, reset loading state
    // This prevents the button from being stuck in loading state forever
    setTimeout(() => {
      // Only reset if still in loading state (progression didn't happen)
      // The component will unmount if progression succeeds, so this is safe
      if (hasCalledOnCompleteRef.current) {
        console.warn('⏱️ VocabularyFillBlanks: Progression timeout (2s) - resetting loading state');
        setHasCalledOnComplete(false);
        hasCalledOnCompleteRef.current = false;
      } else {
        console.warn('✅ VocabularyFillBlanks: Progression succeeded (component should have unmounted)');
      }
    }, 2000);
  }, [lessonData, startTime, getCompletionStatus, answers, singleAnswer, isSingleQuestion, onComplete, hasCalledOnComplete, shuffledBlanks, shuffledSingleOptions]);

  const completion = getCompletionStatus();

  // Render single question format (like evaluation test)
  const renderSingleQuestion = () => {
    return (
      <div className="space-y-6">
        <h3 className="text-lg md:text-xl font-semibold text-center mb-4 md:mb-6">
          {singleSentence}
        </h3>
        <div className="max-w-md mx-auto">
          <select
            value={singleAnswer}
            onChange={(e) => handleSingleAnswer(e.target.value)}
            className="w-full px-3 md:px-4 py-2 md:py-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:outline-none text-sm md:text-lg"
          >
            <option value="">
              {t('evaluation.selectAnswer', 'Select an answer')}
            </option>
            {shuffledSingleOptions.options.map((option, index) => (
              <option key={index} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  // Render text with inline clickable blanks (like example's separateType = false mode)
  const renderTextWithInlineBlanks = useCallback(() => {
    if (!text || !shuffledBlanks.length) return null;

    // Replace ___ placeholders with unique markers
    let processedText = text;
    const blankElements: React.ReactNode[] = [];

    shuffledBlanks.forEach((blank, index) => {
      const selectedAnswer = answers[blank.id];
      const selectedOption = selectedAnswer ? blank.options.find(opt => opt === selectedAnswer) : null;

      const blankDisplay = selectedOption ? (
        <span
          key={blank.id}
          className="inline-block px-2 py-1 md:px-3 md:py-2 rounded-lg border-2 cursor-pointer transition-all duration-200 font-bold shadow-sm bg-green-100 text-green-800 border-green-400 hover:bg-green-200 hover:border-green-500 text-sm md:text-base"
          onClick={() => setShowDropdown(blank.id)}
        >
          {selectedOption}
        </span>
      ) : (
        <span
          key={blank.id}
          className="inline-block px-2 py-1 md:px-3 md:py-2 rounded-lg border-2 cursor-pointer transition-all duration-200 font-bold shadow-sm bg-gray-100 text-gray-800 border-gray-400 hover:bg-gray-200 hover:border-gray-500 text-sm md:text-base"
          onClick={() => setShowDropdown(blank.id)}
        >
          {index + 1}_________
        </span>
      );

      blankElements.push(blankDisplay);
      // Replace the first occurrence of ___ with a unique marker
      processedText = processedText.replace(/___+/, `__BLANK_${blank.id}__`);
    });

    // Split content and insert blank elements
    const parts = processedText.split(/__BLANK_\w+__/);
    const result: React.ReactNode[] = [];

    for (let i = 0; i < parts.length; i++) {
      if (parts[i]) {
        result.push(<span key={`text-${i}`}>{parts[i]}</span>);
      }
      if (i < blankElements.length) {
        result.push(blankElements[i]);
      }
    }

    return (
      <div className="prose max-w-none mb-6">
        <div className="text-sm md:text-lg leading-relaxed whitespace-pre-wrap">
          {result}
        </div>
      </div>
    );
  }, [text, blanks, answers]);

  // Determine title with exercise number if provided
  const title = lessonData.exerciseNumber 
    ? `Vocabulary Fill Blanks #${lessonData.exerciseNumber}`
    : 'Fill in the Blanks'

  return (
    <Card>
      <Card.Header>
        <h3 className="text-lg md:text-xl font-semibold">{title}</h3>
        <p className="text-sm text-neutral-600">
          {isSingleQuestion 
            ? 'Select the correct answer from the dropdown'
            : 'Click on each blank to select the correct word'
          }
        </p>
      </Card.Header>
      <Card.Body>
        {isSingleQuestion ? (
          <div className="min-h-[400px] flex items-center justify-center">
            {renderSingleQuestion()}
          </div>
        ) : (
          <>
            {blanks.length > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-sm text-neutral-600 mb-2">
                  <span>Progress</span>
                  <span>{completion.answered}/{completion.total} filled</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${completion.percentage}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              {renderTextWithInlineBlanks()}
            </div>
          </>
        )}

        {/* Dropdown Modal (like example) */}
        {showDropdown && !isSingleQuestion && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="rounded-lg p-4 md:p-6 max-w-md w-full mx-4 border-2 bg-white">
              <h3 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Select Answer</h3>
              <div className="space-y-2">
                {shuffledBlanks.find(b => b.id === showDropdown)?.options.filter(option => option.trim().length > 0).map((option, optIndex) => (
                  <button
                    key={optIndex}
                    onClick={() => handleAnswerSelect(showDropdown, option)}
                    className="w-full text-left px-4 py-2 rounded-lg border-2 hover:bg-gray-100 border-gray-200"
                  >
                    <span className="font-semibold mr-2 text-blue-600">
                      {String.fromCharCode(65 + optIndex)})
                    </span>
                    {option}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => setShowDropdown(null)}
                  variant="secondary"
                  size="sm"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 whitespace-pre-line">{errorMessage}</p>
          </div>
        )}

        <div className="mt-8 flex justify-between items-center">
          <div className="text-sm text-neutral-600">
            {completion.isComplete
              ? (isSingleQuestion 
                  ? '✓ Answer selected. Ready to continue.'
                  : 'All blanks filled! Ready to continue.')
              : (isSingleQuestion
                  ? 'Please select an answer'
                  : 'Fill in all blanks to continue')
            }
          </div>

          <Button
            onClick={(e) => {
              console.warn('🔴🔴🔴 VocabularyFillBlanks: BUTTON CLICKED!', {
                completion,
                isComplete: completion.isComplete,
                hasCalledOnComplete,
                hasCalledOnCompleteRef: hasCalledOnCompleteRef.current,
                willCall: 'handleComplete',
                event: e,
                buttonDisabled: !completion.isComplete || hasCalledOnComplete
              });
              console.warn('🔴 VocabularyFillBlanks: Calling handleComplete from button');
              handleComplete();
            }}
            disabled={!completion.isComplete || hasCalledOnComplete}
            loading={hasCalledOnComplete}
            size="sm"
            className={completion.isComplete ? 'bg-green-500 hover:bg-green-600' : ''}
          >
            {hasCalledOnComplete ? 'Loading...' : (completion.isComplete ? 'Next' : 'Finish Exercise')}
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
});

VocabularyFillBlanks.displayName = 'VocabularyFillBlanks';

export default VocabularyFillBlanks;
