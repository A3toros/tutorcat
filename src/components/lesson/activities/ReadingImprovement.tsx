import React, { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';

import Button from '../../ui/Button';
import Card from '../../ui/Card';
import Mascot from '../../ui/Mascot';
import { useNotification } from '../../../contexts/NotificationContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { getAIFeedbackHelper } from '../../../utils/aiFeedbackHelper';
import { createBrowserRhythmSampler } from '@/lib/browserRhythm'
import { getSupportedRecordingMimeType, submitSpeechJobAndPoll } from '@/lib/speechJobFlow'

interface ReadingImprovementData {
  lessonId: string;
  activityOrder: number;
  targetText: string;
  similarityThreshold: number;
}

interface ReadingImprovementProps {
  lessonData: ReadingImprovementData;
  onComplete: () => void;
}

const ReadingImprovement = memo<ReadingImprovementProps>(({ lessonData, onComplete }) => {
  const { user } = useAuth();
  const { makeAuthenticatedRequest } = useApi();
  const { showNotification } = useNotification();

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [similarityResult, setSimilarityResult] = useState<any>(null);
  const [attempts, setAttempts] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [startTime] = useState(Date.now());

  const aiFeedbackHelper = getAIFeedbackHelper();

  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const startMsRef = useRef<number>(0)
  const mimeType = useMemo(() => {
    try {
      return getSupportedRecordingMimeType()
    } catch {
      return 'audio/webm'
    }
  }, [])
  const rhythmSamplerRef = useRef(createBrowserRhythmSampler())

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
    rhythmSamplerRef.current.stop()
  }, [])

  // Start reading aloud
  const startReading = useCallback(async () => {
    if (isRecording) return;

    try {
      setTranscript('');
      setSimilarityResult(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      rhythmSamplerRef.current.start(stream)

      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      startMsRef.current = Date.now()

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        const recordingMs = Math.max(1, Date.now() - startMsRef.current)
        const audioBlob = new Blob(chunksRef.current, { type: mimeType })
        cleanupStream()
        setIsRecording(false)

        if (!audioBlob || audioBlob.size < 1000) {
          showNotification('No audio recorded. Please try again.', 'warning')
          return
        }

        setIsProcessing(true)
        setAttempts((prev) => prev + 1)
        try {
          const browserRhythm = rhythmSamplerRef.current.getFeatures(recordingMs)
          const res = await submitSpeechJobAndPoll({
            audioBlob,
            recordingDurationSec: Math.max(1, Math.round(recordingMs / 1000)),
            prompt: lessonData.targetText,
            promptId: 'reading-improvement',
            lessonId: lessonData.lessonId,
            userId: user?.id,
            minWords: 0,
            cefrLevel: user?.level || undefined,
            activityType: 'reading_improvement',
            referenceText: lessonData.targetText,
            browserRhythm,
            skipIntegrityCheck: true,
            skipDeliveryCheck: true,
            requireOverallScore: false,
          })
          const t = res.transcript || ''
          setTranscript(t)

          if (!t.trim()) {
            showNotification('No speech detected. Please try reading again.', 'warning')
            return
          }

          const sim = await aiFeedbackHelper.checkSimilarity(lessonData.targetText, t, 'en')
          if (!sim.success) throw new Error(sim.error || 'Failed to analyze reading')
          setSimilarityResult(sim)

          if (sim.similarity >= lessonData.similarityThreshold) {
            setIsComplete(true)
            showNotification("Excellent reading! You've achieved the required similarity.", 'success')
          } else if (attempts >= 2) {
            setIsComplete(true)
            showNotification('Good effort! Moving to the next activity.', 'info')
          } else {
            showNotification(`Similarity: ${sim.similarity}%. Try reading again for better accuracy.`, 'info')
          }
        } catch (error) {
          console.error('Reading improvement error:', error)
          showNotification('Failed to analyze your reading. Please try again.', 'error')
        } finally {
          setIsProcessing(false)
        }
      }

      recorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Failed to start reading:', error);
      showNotification('Failed to start recording. Please check your microphone permissions.', 'error');
    }
  }, [isRecording, mimeType, cleanupStream, lessonData, user?.id, user?.level, aiFeedbackHelper, attempts, showNotification]);

  // Stop reading and analyze
  const stopReading = useCallback(() => {
    const rec = mediaRecorderRef.current
    if (rec && rec.state === 'recording') {
      rec.requestData()
      rec.stop()
    } else {
      cleanupStream()
      setIsRecording(false)
    }
  }, [cleanupStream]);

  // Handle completion
  const handleComplete = useCallback(async () => {
    if (!user) return;

    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    try {
      const response = await makeAuthenticatedRequest('/.netlify/functions/submit-lesson-activity', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          lessonId: lessonData.lessonId,
          activityType: 'reading_improvement',
          activityOrder: lessonData.activityOrder,
          score: similarityResult?.similarity || 0,
          maxScore: 100,
          attempts: attempts,
          timeSpent,
          completedAt: new Date().toISOString(),
          answers: {
            targetText: lessonData.targetText,
            userTranscript: transcript,
            similarity: similarityResult?.similarity || 0,
            threshold: lessonData.similarityThreshold,
            attempts: attempts
          }
        })
      });

      if (response.ok) {
        showNotification('Reading improvement completed!', 'success');
        onComplete();
      } else {
        throw new Error('Failed to submit activity');
      }
    } catch (error) {
      console.error('Error submitting activity:', error);
      showNotification('Failed to submit activity', 'error');
    }
  }, [user, lessonData, startTime, similarityResult, transcript, attempts, makeAuthenticatedRequest, showNotification, onComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupStream()
    };
  }, [cleanupStream]);

  const canTryAgain = attempts < 3 && similarityResult && similarityResult.similarity < lessonData.similarityThreshold;

  return (
    <Card>
      <Card.Header>
        <h3 className="text-lg md:text-xl font-semibold">Reading Improvement</h3>
        <p className="text-sm text-neutral-600">
          Read the text aloud clearly. Your reading will be compared to the original text.
        </p>
        <div className="mt-2 text-sm">
          Target Similarity: {lessonData.similarityThreshold}%
        </div>
      </Card.Header>
      <Card.Body>
        {/* Target Text */}
        <div className="mb-6 p-6 bg-blue-50 rounded-lg border-2 border-blue-200">
          <h4 className="font-semibold text-blue-800 mb-3">📖 Read this text aloud:</h4>
          <div className="text-sm md:text-lg leading-relaxed text-blue-900 whitespace-pre-wrap">
            {lessonData.targetText}
          </div>
        </div>

        {/* Recording Controls */}
        <div className="mb-6 flex justify-center">
          {!isRecording ? (
            <Button
              onClick={startReading}
              size="sm"
              className="bg-red-500 hover:bg-red-600"
              disabled={isProcessing || isComplete}
            >
              🎤 Start Reading Aloud
            </Button>
          ) : (
            <Button
              onClick={stopReading}
              size="sm"
              className="bg-gray-500 hover:bg-gray-600"
            >
              ⏹️ Stop Reading
            </Button>
          )}
        </div>

        {/* Recording Status */}
        {isRecording && (
          <div className="mb-4 text-center">
            <div className="inline-flex items-center space-x-2 text-red-600">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="font-medium">Recording your reading...</span>
            </div>
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="flex flex-col items-center justify-center py-12">
            <Mascot
              speechText="Analyzing your Meow meow"
              className="scale-125"
              alwaysShowSpeech={true}
            />
            <div className="mt-8 text-center">
              <div className="inline-flex space-x-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"
                    style={{
                      animationDelay: `${i * 0.2}s`,
                      animationDuration: '1.5s'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Transcript Display */}
        {transcript && !isProcessing && (
          <div className="mb-6 p-4 bg-green-50 rounded-lg border-2 border-green-200">
            <h4 className="font-semibold text-green-800 mb-2">📝 Your Reading:</h4>
            <p className="text-green-900 italic">&ldquo;{transcript}&rdquo;</p>
          </div>
        )}

        {/* Similarity Results */}
        {similarityResult && (
          <div className="mb-6 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
            <h4 className="font-semibold text-purple-800 mb-3">📊 Reading Analysis:</h4>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <div className={`text-xl md:text-2xl font-bold ${
                  similarityResult.similarity >= lessonData.similarityThreshold
                    ? 'text-green-600'
                    : 'text-orange-600'
                }`}>
                  {similarityResult.similarity}%
                </div>
                <div className="text-sm text-gray-600">Similarity Score</div>
              </div>

              <div className="text-center">
                <div className="text-xl md:text-2xl font-bold text-blue-600">
                  {attempts}
                </div>
                <div className="text-sm text-gray-600">Attempts</div>
              </div>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  similarityResult.similarity >= lessonData.similarityThreshold
                    ? 'bg-green-500'
                    : 'bg-orange-500'
                }`}
                style={{ width: `${Math.min(similarityResult.similarity, 100)}%` }}
              ></div>
            </div>

            {similarityResult.similarity >= lessonData.similarityThreshold ? (
              <div className="text-green-700 font-medium">
                ✅ Excellent! Your reading matches the original text very closely.
              </div>
            ) : (
              <div className="text-orange-700">
                <div className="font-medium mb-2">💡 Try reading more carefully:</div>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Speak clearly and at a natural pace</li>
                  <li>Pay attention to pronunciation of each word</li>
                  <li>Read the entire text without pausing too long</li>
                </ul>
              </div>
            )}

            {/* Detailed Analysis */}
            {similarityResult.detailedAnalysis && (
              <div className="mt-4 pt-4 border-t border-purple-200">
                <h5 className="font-medium text-purple-800 mb-2">Detailed Analysis:</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Exact matches:</span>
                    <span className="ml-2 font-medium">{similarityResult.detailedAnalysis.exactMatches}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Partial matches:</span>
                    <span className="ml-2 font-medium">{similarityResult.detailedAnalysis.partialMatches}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            🎯 <strong>Goal:</strong> Achieve at least {lessonData.similarityThreshold}% similarity to the original text.
            You have up to 3 attempts to improve your reading.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-neutral-600">
            {isComplete
              ? 'Reading practice completed! Ready to continue.'
              : canTryAgain
                ? 'Try reading again to improve your similarity score.'
                : 'Complete your reading practice.'
            }
          </div>

          {isComplete ? (
            <Button
              onClick={handleComplete}
              className="bg-green-500 hover:bg-green-600"
            >
              Next
            </Button>
          ) : canTryAgain ? (
            <Button
              onClick={() => {
                setTranscript('');
                setSimilarityResult(null);
              }}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Try Again ({3 - attempts} attempts left)
            </Button>
          ) : null}
        </div>
      </Card.Body>
    </Card>
  );
});

ReadingImprovement.displayName = 'ReadingImprovement';

export default ReadingImprovement;
