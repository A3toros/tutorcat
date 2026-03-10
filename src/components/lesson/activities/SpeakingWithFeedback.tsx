import React, { useState, useEffect, useCallback, memo, useRef } from 'react';

import Button from '../../ui/Button';
import Card from '../../ui/Card';
import Mascot from '../../ui/Mascot';
import MascotThinking from '../../ui/MascotThinking';
import { useNotification } from '../../../contexts/NotificationContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useApi } from '../../../hooks/useApi';
import { getAIFeedbackHelper } from '../../../utils/aiFeedbackHelper';
import { lessonProgressStorage } from '../../../services/LessonProgressStorage';

interface SpeakingPrompt {
  id: string;
  text: string;
}

interface SpeakingWithFeedbackData {
  lessonId: string;
  activityOrder: number;
  prompts: SpeakingPrompt[];
  /** CEFR level for minimum word count: A1/A2=20, B1/B2=40, C1/C2=60 */
  level?: string;
  feedbackCriteria: {
    grammar: boolean;
    vocabulary: boolean;
    pronunciation: boolean;
  };
}

interface SpeakingWithFeedbackProps {
  lessonData: SpeakingWithFeedbackData;
  onComplete: (result?: any) => void;
}

type ProcessingStep = 'idle' | 'recording' | 'transcribing' | 'analyzing' | 'feedback' | 'error';

const MAX_RECORDING_DURATION_MS = 120 * 1000; // 2 min
const MAX_AUDIO_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
const POLL_INTERVAL_MS = 2000;
const POLL_INTERVAL_BACKGROUND_MS = 4000; // Slower when tab hidden (browser throttles timers)

function getMinWordsForLevel(level?: string | null): number {
  const l = (level || '').toUpperCase().trim();
  if (l === 'A1' || l === 'A2') return 20;
  if (l === 'B1' || l === 'B2') return 40;
  if (l === 'C1' || l === 'C2') return 60;
  return 20;
}

const SpeakingWithFeedback = memo<SpeakingWithFeedbackProps>(({ lessonData, onComplete }) => {
  const { user } = useAuth();
  const { makeAuthenticatedRequest } = useApi();
  const { showNotification } = useNotification();

  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [currentStep, setCurrentStep] = useState<ProcessingStep>('idle');
  const [transcripts, setTranscripts] = useState<{[key: string]: string}>({});
  const [feedback, setFeedback] = useState<{[key: string]: any}>({});
  const [isComplete, setIsComplete] = useState(false);
  const [isGeneratingImproved, setIsGeneratingImproved] = useState(false);
  const [startTime] = useState(Date.now());
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isMinWordsError, setIsMinWordsError] = useState(false);
  const [isAIFlaggedError, setIsAIFlaggedError] = useState(false);
  const [isSpeechTooLongError, setIsSpeechTooLongError] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const [showMobileRecordingHint, setShowMobileRecordingHint] = useState(false);

  // Two-stage processing state
  const [transcriptionState, setTranscriptionState] = useState<'idle' | 'transcribing' | 'succeeded' | 'failed'>('idle');
  const [analysisState, setAnalysisState] = useState<'idle' | 'analyzing' | 'succeeded' | 'failed'>('idle');
  const [cachedTranscript, setCachedTranscript] = useState<string | null>(null);

  const aiFeedbackHelper = getAIFeedbackHelper();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle prompts - can be array of strings or array of objects with {id, text}
  const prompts = lessonData.prompts || [];
  const currentPrompt = prompts[currentPromptIndex];
  const promptText = typeof currentPrompt === 'string' 
    ? currentPrompt 
    : (currentPrompt as any)?.text || (currentPrompt as any)?.prompt || '';
  const promptId = typeof currentPrompt === 'string' 
    ? `prompt-${currentPromptIndex}` 
    : (currentPrompt as any)?.id || `prompt-${currentPromptIndex}`;
  const currentTranscript = transcripts[promptId] || '';
  const currentFeedback = feedback[promptId];

  // Utility function to convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Helper function to check network status
  const checkNetworkStatus = useCallback(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('No internet connection. Please check your network and try again.');
    }
    return true;
  }, []);

  // Helper function to detect if error is a transient network error
  const isTransientNetworkError = useCallback((error: any) => {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorName = error.name?.toLowerCase() || '';

    if (errorName === 'networkerror' || errorName === 'typeerror') {
      return true;
    }

    if (errorMessage.includes('failed to fetch') ||
        errorMessage.includes('networkerror') ||
        errorMessage.includes('network request failed')) {
      return true;
    }

    if (errorName === 'aborterror' ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('aborted')) {
      return true;
    }

    if (error.status >= 500 && error.status < 600) {
      return true;
    }

    if (error.status === 408 || error.status === 429) {
      return true;
    }

    return false;
  }, []);

  // Helper function to make request with timeout and automatic retry
  const makeRequestWithRetry = useCallback(async (url: string, options: RequestInit, maxRetries = 2) => {
    checkNetworkStatus();

    let lastError: any;
    let timeoutId: NodeJS.Timeout | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 45000); // 45s to match server function timeout (ai-feedback can take 30–40s)

        const requestOptions = {
          ...options,
          signal: controller.signal
        };

        const response = await fetch(url, requestOptions);
        if (timeoutId) clearTimeout(timeoutId);

        return response;
      } catch (error: any) {
        lastError = error;
        if (timeoutId) clearTimeout(timeoutId);

        if (isTransientNetworkError(error) && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          console.log(`🔄 Transient network error detected. Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }, [checkNetworkStatus, isTransientNetworkError]);

  // Check microphone permission status
  useEffect(() => {
    const checkPermissionStatus = async () => {
      try {
        if (!window.isSecureContext && !window.location.hostname.includes('localhost')) {
          setError('Microphone access requires HTTPS. Please use a secure connection.');
          return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setError('Microphone access is not supported in this browser. Please use a modern browser like Chrome, Safari, or Firefox.');
          return;
        }

        if (navigator.permissions) {
          try {
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            if (permissionStatus.state === 'granted') {
              setHasMicPermission(true);
              setCurrentStep('idle');
            }
          } catch (err) {
            console.log('Could not check microphone permission status:', err);
          }
        }
      } catch (err) {
        console.error('Error checking microphone permission:', err);
      }
    };

    checkPermissionStatus();
  }, []);

  // Clear 60s auto-stop timeout on unmount so it never fires after component is gone
  useEffect(() => {
    return () => {
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
        autoStopTimeoutRef.current = null;
      }
    };
  }, []);

  // On mount/reload: restore transcripts and feedback from DB so we don't nullify progress
  useEffect(() => {
    if (!user?.id || !lessonData.lessonId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await makeAuthenticatedRequest(
          `/.netlify/functions/get-speech-jobs-by-lesson?lesson_id=${encodeURIComponent(lessonData.lessonId)}`,
          { method: 'GET' }
        );
        if (cancelled || !res.ok) return;
        const data = await res.json();
        const jobs = (data.jobs || []).filter((j: any) => j.status === 'completed' && j.result);
        if (jobs.length === 0) return;

        const nextTranscripts: Record<string, string> = {};
        const nextFeedback: Record<string, any> = {};
        jobs.forEach((job: any) => {
          const pid = job.prompt_id ?? `prompt-${Object.keys(nextFeedback).length}`;
          if (nextFeedback[pid] != null) return;
          if (job.transcript) nextTranscripts[pid] = job.transcript;
          if (job.result) {
            nextFeedback[pid] = {
              overall_score: job.result.overall_score,
              is_off_topic: job.result.is_off_topic || false,
              feedback: job.result.feedback,
              grammar_corrections: job.result.grammar_corrections || [],
              vocabulary_corrections: job.result.vocabulary_corrections || [],
              ai_feedback: job.result.ai_feedback || null,
              improved_transcript: job.result.improved_transcript || null,
              integrity: job.result.integrity || null,
            };
          }
        });
        if (!cancelled && (Object.keys(nextTranscripts).length > 0 || Object.keys(nextFeedback).length > 0)) {
          setTranscripts(prev => ({ ...prev, ...nextTranscripts }));
          setFeedback(prev => ({ ...prev, ...nextFeedback }));
        }
      } catch (_) {
        // Silent: restore is best-effort
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, lessonData.lessonId, makeAuthenticatedRequest]);

  // Request microphone permission
  const requestMicPermission = async () => {
    try {
      if (!window.isSecureContext) {
        setError('Microphone access requires HTTPS or localhost. Please use a secure connection.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasMicPermission(true);
      setCurrentStep('idle');
      setError(null);
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.error('Microphone permission denied:', err);
      const error = err as Error;
      if (error.name === 'NotAllowedError') {
        setError('Microphone access denied. Please allow microphone access in your browser and try again.');
      } else if (error.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone and try again.');
      } else {
        setError(`Microphone access failed: ${error.message}`);
      }
    }
  };

  // Feature Detection for Audio Formats (platform-specific)
  const getSupportedMimeType = useCallback(() => {
    // Import iOS detection utilities
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIOSDevice) {
      // iOS Safari only supports MP4 formats
      const iosTypes = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2'];
      const supportedType = iosTypes.find(type => MediaRecorder.isTypeSupported(type));
      if (supportedType) {
        console.log(`✅ iOS: Using audio format: ${supportedType}`);
        return supportedType;
      }
      throw new Error('MediaRecorder is not fully supported on this iOS version. Please update iOS or use a different browser.');
    }

    // Android/Desktop: Prioritize WebM/Opus (better quality)
    const preferredTypes = [
      'audio/webm;codecs=opus',      // Best quality for speech
      'audio/webm',                   // WebM fallback
      'audio/mp4;codecs=mp4a.40.2',  // MP4 AAC fallback
      'audio/mp4'                     // Generic MP4 last resort
    ];

    const supportedType = preferredTypes.find(type =>
      MediaRecorder.isTypeSupported(type)
    );

    if (!supportedType) {
      throw new Error("No supported audio format found. Please update your browser.");
    }

    console.log(`✅ Non-iOS: Using audio format: ${supportedType}`);
    return supportedType;
  }, []);

  // Handle analyzing transcript
  const handleAnalyzeTranscript = useCallback(async (transcriptText: string) => {
    if (!transcriptText || !transcriptText.trim()) {
      setAnalysisState('failed');
      setSubmissionError('No transcript available for analysis');
      setCurrentStep('error');
      return;
    }

    setAnalysisState('analyzing');
    setCurrentStep('analyzing');
    setSubmissionError(null);
    setIsSpeechTooLongError(false);
    setIsAIFlaggedError(false);

    try {
      checkNetworkStatus();

      const response = await makeRequestWithRetry('/.netlify/functions/ai-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcription: transcriptText,
          prompt: promptText,
          criteria: lessonData.feedbackCriteria,
          // Use lesson level as the expected baseline; fallback to user level.
          cefr_level: lessonData.level || user?.level || undefined
        })
      });

      if (!response.ok) {
        throw new Error(response.status === 504 || response.status === 500 ? 'Request timed out. Please try again.' : `Server error (${response.status}). Please try again.`);
      }

      let result;
      try {
        const responseText = await response.text();
        result = JSON.parse(responseText);
      } catch (jsonError) {
        throw new Error('AI_SERVER_ERROR');
      }

      if (!result.success) {
        const isSpeechTooLong = result.error_code === 'speech_too_long' ||
          (typeof result.error === 'string' && (
            result.error.includes('2 minute') ||
            result.error.includes('duration') ||
            result.error.includes('audio') ||
            result.error.includes('20 MB')
          ));
        if (isSpeechTooLong) {
          setIsSpeechTooLongError(true);
          setSubmissionError(result.error || 'Please speak for less than 2 minutes.');
          setAnalysisState('failed');
          setCurrentStep('error');
          return;
        }
        throw new Error(result.message || result.error || 'Analysis failed');
      }

      const integrity = result.integrity || result?.feedback?.integrity;
      console.log('🛡️ AI integrity (from API):', integrity ? { risk_score: integrity.risk_score, flagged: integrity.flagged } : 'none');

      // AI integrity: if backend flags the answer, block progression and force re-record.
      // Support multiple possible shapes so frontend works as soon as backend prompt is updated.
      const flagged =
        result?.integrity?.flagged === true ||
        result?.ai_flagged === true ||
        result?.flagged === true ||
        result?.feedback?.integrity?.flagged === true;

      if (flagged) {
        const message =
          result?.integrity?.message ||
          result?.feedback?.integrity?.message ||
          result?.message ||
          'Your answer was flagged for using AI. Please try again using your own words.';

        setSubmissionError(message);
        setIsAIFlaggedError(true);
        setAnalysisState('failed');
        setCurrentStep('error');
        return;
      }

      if (result.overall_score === undefined || typeof result.overall_score !== 'number') {
        setSubmissionError('Something went wrong. Please try again.');
        setAnalysisState('failed');
        setCurrentStep('error');
        return;
      }

      setAnalysisState('succeeded');
      setSubmissionError(null);
    setIsSpeechTooLongError(false);

      const mappedScores = {
        overall_score: result.overall_score,
        is_off_topic: result.is_off_topic || false,
        feedback: result.feedback,
        grammar_corrections: result.grammar_corrections || [],
        vocabulary_corrections: result.vocabulary_corrections || [],
        ai_feedback: result.ai_feedback || null,
        improved_transcript: result.improved_transcript || null, // Store improved transcript from API
        integrity: result.integrity || result?.feedback?.integrity || null
      };

      setFeedback(prev => ({
        ...prev,
        [promptId]: mappedScores
      }));
      setCurrentStep('feedback');

      // Store improved transcript in localStorage for speaking improvement activity
      if (result.improved_transcript && user?.id && lessonData.lessonId) {
        try {
          const savedProgress = lessonProgressStorage.loadProgress(user.id, lessonData.lessonId);
          const updatedActivities = savedProgress?.activities || [];
          
          // Find or create the speaking activity entry
          const activityIndex = updatedActivities.findIndex((activity: any) => 
            (activity.activityType === 'speaking_practice' || activity.activityType === 'speaking_with_feedback') &&
            activity.activityOrder === lessonData.activityOrder
          );
          
          if (activityIndex >= 0) {
            // Update existing activity - store in result.answers
            const existing = updatedActivities[activityIndex];
            const existingAnswers = existing.result?.answers || {};
            updatedActivities[activityIndex] = {
              ...existing,
              result: {
                ...existing.result,
                attempts: existing.result?.attempts || 1,
                answers: {
                  ...existingAnswers,
                  improvedTranscripts: {
                    ...(existingAnswers.improvedTranscripts || {}),
                    [promptId]: result.improved_transcript
                  },
                  // Store the most recent improved transcript for easy access
                  improvedTranscript: result.improved_transcript
                }
              }
            };
          } else {
            // Add new activity entry
            updatedActivities.push({
              activityId: `speaking-${lessonData.activityOrder}-${promptId}`,
              activityOrder: lessonData.activityOrder,
              activityType: 'speaking_with_feedback',
              status: 'in_progress' as const,
              result: {
                attempts: 1,
                answers: {
                  improvedTranscripts: {
                    [promptId]: result.improved_transcript
                  },
                  improvedTranscript: result.improved_transcript
                }
              }
            });
          }
          
          lessonProgressStorage.saveProgress(user.id, lessonData.lessonId, {
            lessonId: lessonData.lessonId,
            userId: user.id,
            currentActivityIndex: savedProgress?.currentActivityIndex || 0,
            activities: updatedActivities,
            startedAt: savedProgress?.startedAt || new Date().toISOString(),
            lastSavedAt: new Date().toISOString()
          });
        } catch (error) {
          console.warn('Failed to save improved transcript to localStorage:', error);
        }
      }

    } catch (error: any) {
      console.error('Analysis error:', error);
      setAnalysisState('failed');
      setIsProcessing(false);
      let errorMessage = 'Analysis failed. Please try again.';
      if (error.message && error.message.includes('No internet connection')) {
        errorMessage = error.message;
      } else if (error.message && (error.message.includes('timeout') || error.message.includes('aborted'))) {
        errorMessage = 'Request timed out. Your connection may be slow. Please try again.';
      } else if (error.message && error.message.includes('network')) {
        errorMessage = 'Connection failed. Please check your internet and try again.';
      } else if (error.message === 'AI_SERVER_ERROR' || error.message.includes('JSON')) {
        errorMessage = 'AI servers are overloaded. Please try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      setSubmissionError(errorMessage);
      setCurrentStep('error');
    }
  }, [promptText, promptId, lessonData.feedbackCriteria, checkNetworkStatus, makeRequestWithRetry]);

  // Handle recording complete - called from onstop handler when stop button is pressed
  const handleRecordingComplete = useCallback(async (audioBlob: Blob, recordingDuration: number) => {
    console.log('📡 handleRecordingComplete called - processing audio and calling API...');
    
    // isProcessing is already set to true in stopRecording, so we don't need to set it again
    setRecordingTime(recordingDuration);
    setCurrentStep('transcribing');
    setTranscriptionState('transcribing');
    setError(null);

    try {
      if (!audioBlob || audioBlob.size === 0 || audioBlob.size < 1000) {
        throw new Error('Audio recording is invalid. Please record again.');
      }

      if (recordingDuration > MAX_RECORDING_DURATION_MS) {
        setSubmissionError('Please speak for less than 2 minutes.');
        setCurrentStep('error');
        setTranscriptionState('failed');
        setAnalysisState('failed');
        setIsProcessing(false);
        return;
      }
      if (audioBlob.size > MAX_AUDIO_SIZE_BYTES) {
        setSubmissionError('Please speak for less than 2 minutes. Max 20 MB.');
        setCurrentStep('error');
        setTranscriptionState('failed');
        setAnalysisState('failed');
        setIsProcessing(false);
        return;
      }

      checkNetworkStatus();
      setIsAIFlaggedError(false);

      const base64Audio = await blobToBase64(audioBlob);

      setCurrentStep('transcribing');
      setTranscriptionState('transcribing');

      const speechJobRes = await makeRequestWithRetry('/.netlify/functions/speech-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_blob: base64Audio,
          audio_mime_type: audioBlob.type || 'audio/webm',
          prompt: promptText,
          prompt_id: promptId,
          cefr_level: lessonData.level || undefined,
          min_words: getMinWordsForLevel(lessonData.level),
          duration_seconds: Math.round(recordingDuration / 1000),
          user_id: user?.id || undefined,
          lesson_id: lessonData.lessonId || undefined,
        }),
      });

      if (!speechJobRes.ok) {
        const errBody = await speechJobRes.json().catch(() => ({}));
        const code = errBody?.code;
        if (speechJobRes.status === 413 || code === 'audio_too_large' || code === 'duration_too_long') {
          setSubmissionError(errBody?.error || 'Please speak for less than 2 minutes.');
          setCurrentStep('error');
          setTranscriptionState('failed');
          setAnalysisState('failed');
          setIsProcessing(false);
          return;
        }
        throw new Error(errBody?.error || `Request failed: ${speechJobRes.status}`);
      }

      const { jobId } = await speechJobRes.json();
      if (!jobId) {
        throw new Error('No job ID returned from server.');
      }

      const pollResult = async (): Promise<{ status: string; result?: any; error?: string; transcript?: string }> => {
        const res = await fetch(`/.netlify/functions/analysis-result?id=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
        return res.json();
      };

      let data = await pollResult();
      while (data.status === 'processing' || data.status === 'analyzing') {
        setCurrentStep(data.status === 'analyzing' ? 'analyzing' : 'transcribing');
        const delay = (typeof document !== 'undefined' && document.visibilityState === 'visible')
          ? POLL_INTERVAL_MS
          : POLL_INTERVAL_BACKGROUND_MS;
        await new Promise((r) => setTimeout(r, delay));
        data = await pollResult();
      }

      if (data.status === 'failed') {
        setSubmissionError(data.error || 'Analysis failed.');
        setCurrentStep('error');
        setAnalysisState('failed');
        const result = data.result || {};
        if (result.min_words != null && result.word_count != null) {
          setIsMinWordsError(true);
        }
        setIsProcessing(false);
        return;
      }

      const result = data.result || {};
      const transcript = data.transcript ?? result.transcript ?? '';

      if (result.min_words != null && result.word_count != null && result.word_count < result.min_words) {
        setSubmissionError(result.error || `Please speak at least ${result.min_words} words. You said ${result.word_count} word(s).`);
        setIsMinWordsError(true);
        setCurrentStep('error');
        setAnalysisState('failed');
        setIsProcessing(false);
        return;
      }

      const isSpeechTooLong = result.error_code === 'speech_too_long' ||
        (typeof result.error === 'string' && (
          result.error.includes('2 minute') ||
          result.error.includes('duration') ||
          result.error.includes('audio') ||
          result.error.includes('20 MB')
        ));
      if (isSpeechTooLong) {
        setIsSpeechTooLongError(true);
        setSubmissionError(result.error || 'Please speak for less than 2 minutes.');
        setCurrentStep('error');
        setAnalysisState('failed');
        setIsProcessing(false);
        return;
      }

      const integrityStt = result.integrity;
      const flagged =
        result?.integrity?.flagged === true ||
        result?.ai_flagged === true ||
        result?.flagged === true;

      if (flagged) {
        const message =
          result?.integrity?.message ||
          result?.message ||
          'Your answer was flagged for using AI. Please try again using your own words.';
        setSubmissionError(message);
        setIsAIFlaggedError(true);
        setCurrentStep('error');
        setAnalysisState('failed');
        setIsProcessing(false);
        return;
      }

      if (result.overall_score === undefined || typeof result.overall_score !== 'number') {
        setSubmissionError('Something went wrong. Please try again.');
        setCurrentStep('error');
        setAnalysisState('failed');
        setIsProcessing(false);
        return;
      }

      setTranscriptionState('succeeded');
      setAnalysisState('succeeded');
      setCachedTranscript(transcript);

      setTranscripts(prev => ({ ...prev, [promptId]: transcript }));
      setFeedback(prev => ({
        ...prev,
        [promptId]: {
          overall_score: result.overall_score,
          is_off_topic: result.is_off_topic || false,
          feedback: result.feedback,
          grammar_corrections: result.grammar_corrections || [],
          vocabulary_corrections: result.vocabulary_corrections || [],
          ai_feedback: result.ai_feedback || null,
          integrity: result.integrity || null,
        },
      }));
      setCurrentStep('feedback');
    } catch (error: any) {
      console.error('Processing error:', error);
      setTranscriptionState('failed');
      let errorMessage = 'Processing failed. Please try again.';
      if (error.message && error.message.includes('No internet connection')) {
        errorMessage = error.message;
      } else if (error.message && (error.message.includes('timeout') || error.message.includes('aborted'))) {
        errorMessage = 'Request timed out. Your connection may be slow. Please try again.';
      } else if (error.message && error.message.includes('network')) {
        errorMessage = 'Connection failed. Please check your internet and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      setSubmissionError(errorMessage);
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  }, [promptText, promptId, lessonData.level, checkNetworkStatus, makeRequestWithRetry, user?.id]);

  // Start recording with MediaRecorder - ONLY starts recording, no API calls
  const startRecording = useCallback(async () => {
    // Reset stopping state when starting a new recording
    setIsStopping(false);
    if (isRecording || !hasMicPermission) {
      console.log('⚠️ Cannot start recording:', { isRecording, hasMicPermission });
      return;
    }

    try {
      console.log('🎤 Starting recording...');
      setIsRecording(true);
      setError(null);
      setCurrentStep('idle');

      // Platform-specific audio constraints
      const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      const audioConstraints = isIOSDevice
        ? { audio: { echoCancellation: true } } // iOS: minimal constraints
        : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }; // Others: full constraints

      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);

      streamRef.current = stream;

      const mimeType = getSupportedMimeType();

      // Platform-specific MediaRecorder options
      const recorderOptions = isIOSDevice
        ? { mimeType } // iOS: no audioBitsPerSecond (not supported)
        : { mimeType, audioBitsPerSecond: 64000 }; // Others: optimal bitrate for speech

      const mediaRecorder = new MediaRecorder(stream, recorderOptions);

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = []; // Reset chunks array

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('🎙️ MediaRecorder stopped - calling API to process audio...');
        
        // Create audio blob from collected chunks
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        console.log(`📦 Audio blob created: ${(audioBlob.size / 1024).toFixed(1)}KB`);
        
        if (audioBlob.size === 0) {
          console.error('⚠️ Audio blob is empty!');
          setError(isIOSDevice
            ? 'No audio recorded. Try speaking for 1–2 seconds before stopping, and ensure you\'re using Safari with microphone access allowed.'
            : 'No audio recorded. Please try again. Try Chrome or Firefox if the problem continues.');
          setCurrentStep('error');
          setIsProcessing(false);
          setIsRecording(false);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          mediaRecorderRef.current = null;
          if (autoStopTimeoutRef.current) {
            clearTimeout(autoStopTimeoutRef.current);
            autoStopTimeoutRef.current = null;
          }
          return;
        }
        
        setAudioBlob(audioBlob);
        const recordingDuration = (window as any).recordingStartTime ?
          Date.now() - (window as any).recordingStartTime : 0;
        
        // Stop the stream tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Clear the MediaRecorder ref and the 60s auto-stop timeout so it can't stop a future recording
        mediaRecorderRef.current = null;
        if (autoStopTimeoutRef.current) {
          clearTimeout(autoStopTimeoutRef.current);
          autoStopTimeoutRef.current = null;
        }
        
        // Now call the API to process the audio
        try {
          console.log('📡 Calling API to process audio...');
          await handleRecordingComplete(audioBlob, recordingDuration);
        } catch (error) {
          console.error('Error in handleRecordingComplete:', error);
          setError('Failed to process recording. Please try again.');
          setCurrentStep('error');
          setIsProcessing(false);
        }
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording error. Please try again or use Chrome/Firefox for best support.');
        setIsRecording(false);
        setIsProcessing(false);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        mediaRecorderRef.current = null;
        if (autoStopTimeoutRef.current) {
          clearTimeout(autoStopTimeoutRef.current);
          autoStopTimeoutRef.current = null;
        }
      };

      mediaRecorder.start(isIOSDevice ? 1000 : undefined);
      (window as any).recordingStartTime = Date.now();
      console.log('✅ Recording started successfully');
      if (isIOSDevice) {
        setShowMobileRecordingHint(true);
        setTimeout(() => setShowMobileRecordingHint(false), 4000);
      }

      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
        autoStopTimeoutRef.current = null;
      }
      autoStopTimeoutRef.current = setTimeout(() => {
        autoStopTimeoutRef.current = null;
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          console.log('⏰ Auto-stopping recording after 1 minute');
          mediaRecorderRef.current.requestData();
          mediaRecorderRef.current.stop();
          // Don't clear ref - let onstop handler do it
        }
      }, 60000);

    } catch (error) {
      console.error('Failed to start recording:', error);
      const err = error as { name?: string; message?: string };
      const isNotAllowed = err?.name === 'NotAllowedError';
      setError(isNotAllowed
        ? 'Microphone access was denied. Allow microphone in your browser or site settings, or try Chrome/Firefox.'
        : 'Failed to start recording. Please check your microphone permissions.');
      setIsRecording(false);
    }
  }, [isRecording, hasMicPermission, getSupportedMimeType, handleRecordingComplete]);

  // Stop recording - this will trigger onstop handler which calls the API
  const stopRecording = useCallback(() => {
    console.log('🛑 Stop recording called');
    
    // Immediately disable button and show gray state
    setIsStopping(true);
    
    if (!mediaRecorderRef.current) {
      console.log('⚠️ No MediaRecorder to stop');
      setIsRecording(false);
      setIsStopping(false);
      return;
    }

    const mediaRecorder = mediaRecorderRef.current;
    
    if (mediaRecorder.state === 'recording') {
      console.log('🛑 Stopping MediaRecorder...');
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
        autoStopTimeoutRef.current = null;
      }
      // Update UI state immediately
      setIsRecording(false);
      setIsProcessing(true);
      setCurrentStep('transcribing');
      
      // Request any remaining data before stopping
      mediaRecorder.requestData();
      // Stop the recorder - this will trigger onstop handler which calls handleRecordingComplete
      mediaRecorder.stop();
      // Don't clear the ref here - let onstop handler do it
    } else {
      console.log('⚠️ MediaRecorder not recording, state:', mediaRecorder.state);
      setIsRecording(false);
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
        autoStopTimeoutRef.current = null;
      }
      // If already stopped, clean up manually
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      mediaRecorderRef.current = null;
    }
  }, []);

  // Retry transcription (re-upload same audio to speech-job, then poll)
  const handleRetryTranscription = useCallback(async () => {
    if (!audioBlob) return;

    try {
      checkNetworkStatus();
    } catch (networkError) {
      setSubmissionError(networkError instanceof Error ? networkError.message : 'Network check failed');
      setCurrentStep('error');
      return;
    }

    const recordingDurationMs = recordingTime || 0;
    if (recordingDurationMs > MAX_RECORDING_DURATION_MS || audioBlob.size > MAX_AUDIO_SIZE_BYTES) {
      setSubmissionError('Please speak for less than 2 minutes. Max 20 MB.');
      setCurrentStep('error');
      return;
    }

    setIsResending(true);
    setSubmissionError(null);
    setIsSpeechTooLongError(false);
    setTranscriptionState('transcribing');
    setCurrentStep('transcribing');

    try {
      const base64Audio = await blobToBase64(audioBlob);

      const speechJobRes = await makeRequestWithRetry('/.netlify/functions/speech-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_blob: base64Audio,
          audio_mime_type: audioBlob.type || 'audio/webm',
          prompt: promptText,
          prompt_id: promptId,
          cefr_level: lessonData.level || undefined,
          min_words: getMinWordsForLevel(lessonData.level),
          duration_seconds: Math.round(recordingDurationMs / 1000),
          user_id: user?.id || undefined,
          lesson_id: lessonData.lessonId || undefined,
        }),
      });

      if (!speechJobRes.ok) {
        const errBody = await speechJobRes.json().catch(() => ({}));
        setSubmissionError(errBody?.error || 'Request failed. Please try again.');
        setTranscriptionState('failed');
        setCurrentStep('error');
        setIsResending(false);
        return;
      }

      const { jobId } = await speechJobRes.json();
      if (!jobId) {
        setSubmissionError('No job ID returned.');
        setTranscriptionState('failed');
        setCurrentStep('error');
        setIsResending(false);
        return;
      }

      const pollResult = async (): Promise<{ status: string; result?: any; error?: string; transcript?: string }> => {
        const res = await fetch(`/.netlify/functions/analysis-result?id=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Poll failed: ${res.status}`);
        return res.json();
      };

      let data = await pollResult();
      while (data.status === 'processing' || data.status === 'analyzing') {
        setCurrentStep(data.status === 'analyzing' ? 'analyzing' : 'transcribing');
        const delay = (typeof document !== 'undefined' && document.visibilityState === 'visible')
          ? POLL_INTERVAL_MS
          : POLL_INTERVAL_BACKGROUND_MS;
        await new Promise((r) => setTimeout(r, delay));
        data = await pollResult();
      }

      if (data.status === 'failed') {
        setSubmissionError(data.error || 'Analysis failed.');
        setAnalysisState('failed');
        setCurrentStep('error');
        const result = data.result || {};
        if (result.min_words != null && result.word_count != null) {
          setIsMinWordsError(true);
        }
        setIsResending(false);
        return;
      }

      const result = data.result || {};
      const transcript = data.transcript ?? result.transcript ?? '';

      const flagged =
        result?.integrity?.flagged === true ||
        result?.ai_flagged === true ||
        result?.flagged === true;
      if (flagged) {
        setSubmissionError(result?.integrity?.message || result?.message || 'Your answer was flagged for using AI. Please try again using your own words.');
        setIsAIFlaggedError(true);
        setAnalysisState('failed');
        setCurrentStep('error');
        setIsResending(false);
        return;
      }

      if (result.overall_score === undefined || typeof result.overall_score !== 'number') {
        setSubmissionError('Something went wrong. Please try again.');
        setAnalysisState('failed');
        setCurrentStep('error');
        setIsResending(false);
        return;
      }

      setTranscriptionState('succeeded');
      setAnalysisState('succeeded');
      setCachedTranscript(transcript);
      setTranscripts(prev => ({ ...prev, [promptId]: transcript }));
      setFeedback(prev => ({
        ...prev,
        [promptId]: {
          overall_score: result.overall_score,
          is_off_topic: result.is_off_topic || false,
          feedback: result.feedback,
          grammar_corrections: result.grammar_corrections || [],
          vocabulary_corrections: result.vocabulary_corrections || [],
          ai_feedback: result.ai_feedback || null,
          integrity: result.integrity || null,
        },
      }));
      setCurrentStep('feedback');
    } catch (error: any) {
      setAnalysisState('failed');
      setSubmissionError(error?.message || 'Request failed. Please try again.');
      setCurrentStep('error');
    } finally {
      setIsResending(false);
    }
  }, [audioBlob, recordingTime, promptText, promptId, lessonData.level, checkNetworkStatus, makeRequestWithRetry, user?.id]);

  // Retry analysis (no re-upload: create new job from stored transcript, then poll)
  const handleRetryAnalysis = useCallback(async () => {
    if (!cachedTranscript) return;

    try {
      checkNetworkStatus();
    } catch (networkError) {
      setSubmissionError(networkError instanceof Error ? networkError.message : 'Network check failed');
      setCurrentStep('error');
      return;
    }

    setIsResending(true);
    setSubmissionError(null);
    setIsSpeechTooLongError(false);
    setCurrentStep('analyzing');
    setAnalysisState('analyzing');

    try {
      const res = await makeRequestWithRetry('/.netlify/functions/retry-speech-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: cachedTranscript,
          prompt: promptText,
          prompt_id: promptId,
          cefr_level: lessonData.level || undefined,
          user_id: user?.id || undefined,
          lesson_id: lessonData.lessonId || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `Request failed: ${res.status}`);
      }

      const { jobId } = await res.json();
      if (!jobId) throw new Error('No job ID returned.');

      const pollResult = async (): Promise<{ status: string; result?: any; error?: string; transcript?: string }> => {
        const r = await fetch(`/.netlify/functions/analysis-result?id=${encodeURIComponent(jobId)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`Poll failed: ${r.status}`);
        return r.json();
      };

      let data = await pollResult();
      while (data.status === 'processing' || data.status === 'analyzing') {
        setCurrentStep(data.status === 'analyzing' ? 'analyzing' : 'transcribing');
        const delay = (typeof document !== 'undefined' && document.visibilityState === 'visible')
          ? POLL_INTERVAL_MS
          : POLL_INTERVAL_BACKGROUND_MS;
        await new Promise((r) => setTimeout(r, delay));
        data = await pollResult();
      }

      if (data.status === 'failed') {
        setSubmissionError(data.error || 'Analysis failed.');
        setAnalysisState('failed');
        setCurrentStep('error');
        const result = data.result || {};
        if (result.min_words != null && result.word_count != null) {
          setIsMinWordsError(true);
        }
        setIsResending(false);
        return;
      }

      const result = data.result || {};
      const flagged =
        result?.integrity?.flagged === true ||
        result?.ai_flagged === true ||
        result?.flagged === true;

      if (flagged) {
        const message =
          result?.integrity?.message ||
          result?.message ||
          'Your answer was flagged for using AI. Please try again using your own words.';
        setSubmissionError(message);
        setIsAIFlaggedError(true);
        setAnalysisState('failed');
        setCurrentStep('error');
        setIsResending(false);
        return;
      }

      if (result.overall_score === undefined || typeof result.overall_score !== 'number') {
        setSubmissionError('Something went wrong. Please try again.');
        setAnalysisState('failed');
        setCurrentStep('error');
        setIsResending(false);
        return;
      }

      setAnalysisState('succeeded');
      setFeedback(prev => ({
        ...prev,
        [promptId]: {
          overall_score: result.overall_score,
          is_off_topic: result.is_off_topic || false,
          feedback: result.feedback,
          grammar_corrections: result.grammar_corrections || [],
          vocabulary_corrections: result.vocabulary_corrections || [],
          ai_feedback: result.ai_feedback || null,
          integrity: result.integrity || null,
        },
      }));
      setCurrentStep('feedback');
    } catch (error: any) {
      setSubmissionError(error?.message || 'Analysis failed. Please try again.');
      setAnalysisState('failed');
      setCurrentStep('error');
    } finally {
      setIsResending(false);
    }
  }, [cachedTranscript, promptText, promptId, lessonData.level, checkNetworkStatus, makeRequestWithRetry, user?.id]);

  // Handle next prompt or completion
  const handleNext = useCallback(() => {
    if (currentPromptIndex < prompts.length - 1) {
      setCurrentPromptIndex(prev => prev + 1);
      setTranscripts(prev => ({ ...prev }));
      setFeedback(prev => ({ ...prev }));
      setCurrentStep('idle');
      setError(null);
      setSubmissionError(null);
    setIsSpeechTooLongError(false);
      setAudioBlob(null);
      setCachedTranscript(null);
      setTranscriptionState('idle');
      setAnalysisState('idle');
    } else {
      setIsComplete(true);
    }
  }, [currentPromptIndex, prompts.length]);

  // Generate combined improved version from all transcripts
  const generateCombinedImprovedVersion = useCallback(async (allTranscripts: string[]): Promise<string> => {
    try {
      const response = await makeRequestWithRetry('/.netlify/functions/improve-transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: allTranscripts.join(' '), // Combine all transcripts
          prompt: `Combine and improve all the student's responses into one coherent, well-structured paragraph. Use appropriate transitions and connectors to create a unified text that flows naturally. Fix all grammar and vocabulary mistakes while maintaining the student's original meaning and intent.`,
          criteria: lessonData.feedbackCriteria,
          level: lessonData.level || user?.level || 'A1'
        })
      });

      const responseText = await response.text();
      const result = JSON.parse(responseText);

      if (result.improved_text && typeof result.improved_text === 'string' && result.improved_text.trim()) {
        return result.improved_text.trim();
      }

      throw new Error(result.error || 'Failed to improve transcription');
    } catch (error) {
      console.error('Error generating combined improved version:', error);
      // Fallback: combine individual improved transcripts if available
      const individualImproved = Object.values(feedback)
        .map((f: any) => f?.improved_transcript)
        .filter(Boolean)
        .join(' ');
      
      return individualImproved || allTranscripts.join(' ');
    }
  }, [feedback, lessonData.feedbackCriteria, makeRequestWithRetry]);

  // Handle completion
  const handleComplete = useCallback(async () => {
    if (!user || isGeneratingImproved) return;

    setIsGeneratingImproved(true);
    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    try {
      // Collect all transcripts from all prompts
      const allTranscripts = Object.values(transcripts).filter(Boolean) as string[];
      
      if (allTranscripts.length === 0) {
        throw new Error('No transcripts available');
      }

      // Generate combined improved version from all transcripts
      const combinedImprovedVersion = await generateCombinedImprovedVersion(allTranscripts);

      // Store combined improved version in localStorage for SpeakingImprovement component
      try {
        const savedProgress = lessonProgressStorage.loadProgress(user.id, lessonData.lessonId);
        const updatedActivities = savedProgress?.activities || [];
        
        const activityIndex = updatedActivities.findIndex((activity: any) => 
          (activity.activityType === 'speaking_practice' || activity.activityType === 'speaking_with_feedback') &&
          activity.activityOrder === lessonData.activityOrder
        );
        
        if (activityIndex >= 0) {
          const existing = updatedActivities[activityIndex];
          const existingAnswers = existing.result?.answers || {};
          updatedActivities[activityIndex] = {
            ...existing,
            result: {
              ...existing.result,
              attempts: existing.result?.attempts || 1,
              answers: {
                ...existingAnswers,
                improvedTranscript: combinedImprovedVersion, // Store combined improved version
                transcripts: transcripts, // Store all individual transcripts
                feedback: feedback // Store all feedback
              }
            }
          };
        } else {
          updatedActivities.push({
            activityId: `speaking-${lessonData.activityOrder}`,
            activityOrder: lessonData.activityOrder,
            activityType: 'speaking_with_feedback',
            status: 'in_progress' as const,
            result: {
              answers: {
                improvedTranscript: combinedImprovedVersion,
                transcripts: transcripts,
                feedback: feedback
              },
              attempts: 1,
              score: 0,
              maxScore: 100
            }
          });
        }
        
        lessonProgressStorage.saveProgress(user.id, lessonData.lessonId, {
          lessonId: lessonData.lessonId,
          userId: user.id,
          currentActivityIndex: savedProgress?.currentActivityIndex || 0,
          activities: updatedActivities,
          startedAt: savedProgress?.startedAt || new Date().toISOString(),
          lastSavedAt: new Date().toISOString()
        });
        
        console.log('✅ Combined improved version saved to localStorage:', {
          improvedTranscript: combinedImprovedVersion.substring(0, 50) + '...',
          activityIndex: activityIndex >= 0 ? activityIndex : updatedActivities.length - 1,
          activitiesCount: updatedActivities.length,
          savedActivityType: updatedActivities[activityIndex >= 0 ? activityIndex : updatedActivities.length - 1]?.activityType,
          hasImprovedTranscript: !!updatedActivities[activityIndex >= 0 ? activityIndex : updatedActivities.length - 1]?.result?.answers?.improvedTranscript
        });
      } catch (error) {
        console.error('❌ Failed to save combined improved version to localStorage:', error);
      }

      // Submit activity results
      const response = await makeAuthenticatedRequest('/.netlify/functions/submit-lesson-activity', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          lessonId: lessonData.lessonId,
          activityType: 'speaking_with_feedback',
          activityOrder: lessonData.activityOrder,
          score: lessonData.prompts.length,
          maxScore: lessonData.prompts.length,
          attempts: 1,
          timeSpent,
          completedAt: new Date().toISOString(),
          answers: {
            promptsCompleted: lessonData.prompts.length,
            transcripts,
            feedback,
            improvedTranscript: combinedImprovedVersion, // Include combined improved version
            // Include improved transcripts for each prompt
            improvedTranscripts: Object.keys(feedback).reduce((acc: any, key) => {
              if (feedback[key]?.improved_transcript) {
                acc[key] = feedback[key].improved_transcript;
              }
              return acc;
            }, {})
          }
        })
      });

      if (response.ok) {
        // Pass result object to onComplete so parent can save to localStorage
        onComplete({
          activityId: `speaking-${lessonData.activityOrder}`,
          activityOrder: lessonData.activityOrder,
          score: lessonData.prompts.length,
          maxScore: lessonData.prompts.length,
          attempts: 1,
          timeSpent,
          completedAt: new Date().toISOString(),
          answers: {
            promptsCompleted: lessonData.prompts.length,
            transcripts,
            feedback,
            improvedTranscript: combinedImprovedVersion
          }
        });
      } else {
        throw new Error('Failed to submit activity');
      }
    } catch (error) {
      console.error('Error completing speaking activity:', error);
      showNotification('Failed to complete speaking activity', 'error');
    } finally {
      setIsGeneratingImproved(false);
    }
  }, [user, lessonData, startTime, transcripts, feedback, isGeneratingImproved, generateCombinedImprovedVersion, makeAuthenticatedRequest, showNotification, onComplete]);

  if (!promptText) {
    return (
      <Card>
        <Card.Body>
          <p>No speaking prompts available.</p>
        </Card.Body>
      </Card>
    );
  }

  // Permission step
  if (!hasMicPermission && currentStep === 'idle') {
    return (
      <Card>
        <Card.Header>
          <h3 className="text-lg md:text-xl font-semibold">Speaking Practice</h3>
          <p className="text-sm text-neutral-600">
            We need access to your microphone to record your speech.
          </p>
        </Card.Header>
        <Card.Body>
          <div className="text-center py-8">
            <div className="mb-6">
              <div className="text-6xl mb-4">🎤</div>
              <h4 className="text-base md:text-lg font-semibold mb-2">Microphone Access Required</h4>
              <p className="text-neutral-600">
                This activity requires microphone access to record and analyze your spoken responses.
              </p>
            </div>
            <Button
              onClick={requestMicPermission}
              size="lg"
              className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2"
            >
              <img src="/mic-start.png" alt="Microphone" className="w-5 h-5" />
              Allow Microphone Access
            </Button>
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800">{error}</p>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>
    );
  }

  // Transcribing state
  if (currentStep === 'transcribing') {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <MascotThinking
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
    );
  }

  // Analyzing state
  if (currentStep === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <MascotThinking
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
    );
  }

  // Error state
  if (currentStep === 'error') {
    const isTranscriptionError = !isMinWordsError && transcriptionState === 'failed';
    const isAnalysisError = analysisState === 'failed';
    const isIntegrityError = isAIFlaggedError === true;
    const retryHandler = isTranscriptionError ? handleRetryTranscription :
                       isAnalysisError ? handleRetryAnalysis :
                       isSpeechTooLongError ? () => { setSubmissionError(null); setIsSpeechTooLongError(false); setError(null); setCurrentStep('idle'); } :
                       () => { setCurrentStep('idle'); setError(null); setIsMinWordsError(false); };

    return (
      <Card>
        <Card.Header>
          <h3 className="text-lg md:text-xl font-semibold text-red-800">
            {isMinWordsError ? 'Not enough words' : isIntegrityError ? 'Flagged' : isSpeechTooLongError ? 'Speech too long' : '⚠️ Processing Error'}
          </h3>
          <p className="text-sm text-red-600">
            {isIntegrityError
              ? 'Your answer was flagged for using AI. Please re-record and answer using your own words.'
              : (submissionError || error)}
          </p>
        </Card.Header>
        <Card.Body>
          <div className="space-y-4">
            {isMinWordsError && (
              <p className="text-sm text-neutral-600">
                Please tap "Re-record" and speak for longer to meet the minimum word count.
              </p>
            )}
            {!isIntegrityError && !isMinWordsError && (
              <p className="text-sm text-neutral-600">
                {isSpeechTooLongError
                  ? 'Please speak for less than 2 minutes (max 20 MB). Then tap "Re-record" to try again.'
                  : isTranscriptionError
                  ? 'Transcription failed. Click "Retry Transcription" to try again, or "Re-record" to start over.'
                  : isAnalysisError
                  ? 'Analysis failed. Your transcription was successful. Click "Retry Analysis" to try again.'
                  : 'Your recording has been saved. Click "Retry" to try again, or "Re-record" to start over.'}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              {!isMinWordsError && !isIntegrityError && (
              <Button
                onClick={retryHandler}
                disabled={isResending}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                {isResending ? 'Retrying...' :
                 isTranscriptionError ? 'Retry Transcription' :
                 isAnalysisError ? 'Retry Analysis' :
                 isSpeechTooLongError ? 'Retry' : 'Retry'}
              </Button>
              )}
              {(!isAnalysisError || isMinWordsError || isIntegrityError || isSpeechTooLongError) && (
                <Button
                  onClick={() => {
                    setAudioBlob(null);
                    setError(null);
                    setSubmissionError(null);
    setIsSpeechTooLongError(false);
                    setIsMinWordsError(false);
                    setIsAIFlaggedError(false);
                    setIsSpeechTooLongError(false);
                    setIsProcessing(false);
                    setIsResending(false);
                    setTranscriptionState('idle');
                    setAnalysisState('idle');
                    setCachedTranscript(null);
                    setCurrentStep('idle');
                  }}
                  variant="secondary"
                  disabled={isResending}
                >
                  Re-record
                </Button>
              )}
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  }

  // Show only mascot when generating improved version
  if (isGeneratingImproved) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <MascotThinking
          speechText="Creating improved version Meow meow"
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
    );
  }

  return (
    <Card>
      <Card.Header>
        <h3 className="text-xl font-semibold">Speaking Practice</h3>
        <p className="text-sm text-neutral-600">
          Practice speaking by responding to the prompts below
        </p>
        <div className="mt-2 text-sm">
          Prompt {currentPromptIndex + 1} of {prompts.length}
        </div>
      </Card.Header>
      <Card.Body>
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <Button
              onClick={() => setError(null)}
              size="sm"
              variant="secondary"
              className="mt-2"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Current Prompt */}
        {promptText && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
            <h4 className="font-semibold text-blue-800 mb-2">Speak about this topic:</h4>
            <p className="text-sm md:text-lg text-blue-900 mb-2">{promptText}</p>
          </div>
        )}

        {/* Recording Controls */}
        {!isProcessing && transcriptionState !== 'transcribing' && analysisState !== 'analyzing' && !currentFeedback && (
          <div className="mb-6 flex justify-center">
            {!isRecording ? (
              <div className="flex flex-col items-center">
                <img 
                  src="/mic-start.png" 
                  alt="Start Recording" 
                  className="w-16 h-16 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={startRecording}
                  onError={(e) => {
                    console.error('Failed to load mic-start.png');
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <p className="text-xs text-neutral-500 mt-2">Allow microphone when your browser prompts.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <img
                  src="/mic-stop.png"
                  alt="Stop Recording"
                  className={`w-16 h-16 transition-all duration-200 ${
                    isStopping 
                      ? 'opacity-50 grayscale cursor-not-allowed' 
                      : 'cursor-pointer hover:opacity-80'
                  }`}
                  onClick={isStopping ? undefined : stopRecording}
                  onError={(e) => {
                    console.error('Failed to load mic-stop.png');
                    e.currentTarget.style.display = 'none';
                  }}
                />
                {isStopping ? (
                  <p className="text-sm font-medium text-amber-700">Stop pressed. Processing your recording...</p>
                ) : (
                  <p className="text-sm text-neutral-600">Recording... Click the button above to stop</p>
                )}
                {showMobileRecordingHint && (
                  <p className="text-xs text-amber-700">Keep this tab open while recording.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Combined Transcript and Feedback Display */}
        {currentTranscript && !isProcessing && (
          <div className="mb-6 p-4 bg-green-50 rounded-lg border-2 border-green-200">
            <h4 className="font-semibold text-green-800 mb-2">📝 Your Response:</h4>
            <p className="text-green-900 italic">&ldquo;{currentTranscript}&rdquo;</p>

            {/* AI Feedback */}
            {currentFeedback && (
              <div className="mt-4 pt-4 border-t border-green-300">
                <h5 className="font-semibold text-green-800 mb-3">
                  AI Feedback:
                </h5>

                {/* Topic validation */}
                {currentFeedback.is_off_topic && (
                  <div className="mb-3 p-3 bg-red-100 border border-red-300 rounded-lg">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-red-600 font-medium">⚠️ Off Topic</span>
                    </div>
                    <p className="text-red-800 text-sm">
                      {currentFeedback.feedback || `Your response doesn't seem to address the prompt. Please speak about: ${promptText}`}
                    </p>
                  </div>
                )}

                {/* Show feedback only if on-topic */}
                {!currentFeedback.is_off_topic && (
                  <>
                    {currentFeedback.overall_score !== undefined && (
                      <div className="mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">Score:</span>
                          <div className="flex space-x-1">
                            {Array.from({ length: 5 }, (_, i) => (
                              <div
                                key={i}
                                className={`w-4 h-4 rounded ${
                                  i < Math.round(currentFeedback.overall_score / 20) ? 'bg-yellow-400' : 'bg-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm text-gray-600">({currentFeedback.overall_score}/100)</span>
                        </div>
                      </div>
                    )}

                    {/* Grammar Corrections - filter out capitalization-only corrections for spoken responses */}
                    {currentFeedback.grammar_corrections && currentFeedback.grammar_corrections.length > 0 && (() => {
                      // Filter out capitalization-only corrections (not relevant for spoken language); show max 3
                      const meaningfulCorrections = (currentFeedback.grammar_corrections as any[])
                        .filter((correction: any) => {
                          const mistake = (correction.mistake || '').toLowerCase();
                          const correctionText = (correction.correction || '').toLowerCase();
                          return mistake !== correctionText;
                        })
                        .slice(0, 3);
                      
                      if (meaningfulCorrections.length === 0) return null;
                      
                      return (
                        <div className="mb-3">
                          <span className="font-medium text-red-700">Grammar:</span>
                          <div className="mt-1 space-y-1">
                            {meaningfulCorrections.map((correction: any, index: number) => (
                              <div key={index} className="text-sm flex items-center space-x-2">
                                <span className="text-red-600 line-through">{correction.mistake}</span>
                                <span className="text-gray-400">→</span>
                                <span className="text-green-600 font-medium">{correction.correction}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Vocabulary Corrections */}
                    {currentFeedback.vocabulary_corrections && currentFeedback.vocabulary_corrections.length > 0 && (
                      <div className="mb-3">
                        <span className="font-medium text-blue-700">Vocabulary:</span>
                        <div className="mt-1 space-y-1">
                          {(currentFeedback.vocabulary_corrections as any[]).slice(0, 3).map((correction: any, index: number) => (
                            <div key={index} className="text-sm">
                              <span className="text-blue-600 font-medium">{correction.correction}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Feedback text */}
                    {currentFeedback.feedback && currentFeedback.feedback !== 'brief summary' && currentFeedback.feedback !== '1-2 sentence summary only' && (
                      <div className="mb-3">
                        <p className="text-green-900 text-sm italic">{currentFeedback.feedback}</p>
                      </div>
                    )}
                  </>
                )}

                {/* Below 60%: prompt re-record */}
                {currentFeedback?.overall_score !== undefined && currentFeedback.overall_score < 60 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                    <p className="text-amber-800 text-sm font-medium mb-2">
                      ⚠️ Score is below 60%. Consider re-recording for better practice.
                    </p>
                    <Button
                      onClick={() => {
                        setTranscripts(prev => ({ ...prev, [promptId]: '' }));
                        setFeedback(prev => ({ ...prev, [promptId]: undefined }));
                        setCachedTranscript(null);
                        setCurrentStep('idle');
                        setAudioBlob(null);
                      }}
                      variant="secondary"
                      size="sm"
                      className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-400"
                    >
                      Re-record this response
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-neutral-600">
            {isComplete
              ? 'All speaking prompts completed! Ready to continue.'
              : currentFeedback && currentFeedback.overall_score !== undefined && currentFeedback.overall_score < 60
                ? 'Score below 60%. Re-record this response to continue.'
                : currentFeedback
                  ? 'Great job! Ready for the next prompt.'
                  : 'Record your response to get AI feedback'
            }
          </div>

          {isComplete ? (
            <div
              onClick={handleComplete}
              className="px-4 md:px-6 py-2 md:py-3 rounded-lg bg-green-500 hover:opacity-80 text-white font-semibold cursor-pointer transition-opacity text-center text-sm md:text-base"
            >
              Next
            </div>
          ) : (
            <div
              onClick={currentFeedback && (currentFeedback.overall_score === undefined || currentFeedback.overall_score >= 60) ? handleNext : undefined}
              className={`px-4 md:px-6 py-2 md:py-3 rounded-lg text-white font-semibold text-center transition-opacity text-sm md:text-base ${
                currentFeedback && (currentFeedback.overall_score === undefined || currentFeedback.overall_score >= 60)
                  ? 'bg-blue-500 hover:opacity-80 cursor-pointer' 
                  : 'bg-gray-400 cursor-not-allowed opacity-50'
              }`}
            >
              {currentPromptIndex < prompts.length - 1 ? 'Next' : 'Finish Speaking'}
            </div>
          )}
        </div>
      </Card.Body>
    </Card>
  );
});

SpeakingWithFeedback.displayName = 'SpeakingWithFeedback';

export default SpeakingWithFeedback;
