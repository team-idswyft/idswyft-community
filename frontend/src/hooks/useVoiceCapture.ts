import { useState, useRef, useCallback, useEffect } from 'react';

export type VoiceCapturePhase = 'idle' | 'requesting_challenge' | 'ready' | 'recording' | 'submitting' | 'completed' | 'failed';

export interface VoiceCaptureResult {
  challenge_verified: boolean;
  similarity_score: number;
  passed: boolean;
  skipped_reason?: string | null;
}

export interface UseVoiceCaptureOptions {
  enabled: boolean;
  maxRecordingMs?: number;
  onComplete?: (result: VoiceCaptureResult) => void;
  onError?: (error: string) => void;
}

export interface UseVoiceCaptureReturn {
  phase: VoiceCapturePhase;
  challengeDigits: string | null;
  expiresIn: number | null;
  isRecording: boolean;
  recordingDuration: number;
  error: string | null;
  result: VoiceCaptureResult | null;
  requestChallenge: () => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  getAudioBlob: () => Blob | null;
  retry: () => void;
}

export function useVoiceCapture(options: UseVoiceCaptureOptions): UseVoiceCaptureReturn {
  const { enabled, maxRecordingMs = 10000, onError } = options;

  const [phase, setPhase] = useState<VoiceCapturePhase>('idle');
  const [challengeDigits, setChallengeDigits] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceCaptureResult | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<number | null>(null);
  const durationRef = useRef<number | null>(null);
  const expiryTimerRef = useRef<number | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      if (durationRef.current) clearInterval(durationRef.current);
      if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    };
  }, []);

  const requestChallenge = useCallback(async () => {
    setPhase('requesting_challenge');
    setError(null);
    setChallengeDigits(null);

    // Simulated — the actual API call happens in DemoPage.
    // This hook just manages the MediaRecorder state.
    // DemoPage will call this after fetching the challenge from the API.
  }, []);

  const setChallengeFromApi = useCallback((digits: string, expiresInSeconds: number) => {
    setChallengeDigits(digits);
    setExpiresIn(expiresInSeconds);
    setPhase('ready');

    // Start countdown timer
    const start = Date.now();
    if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
    expiryTimerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remaining = expiresInSeconds - elapsed;
      if (remaining <= 0) {
        setExpiresIn(0);
        setError('Challenge expired. Please request a new one.');
        setPhase('failed');
        if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
      } else {
        setExpiresIn(remaining);
      }
    }, 1000);
  }, []);

  const startRecording = useCallback(async () => {
    if (!enabled || phase !== 'ready') return;

    setError(null);
    chunksRef.current = [];
    audioBlobRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        audioBlobRef.current = blob;
        setIsRecording(false);
        if (durationRef.current) clearInterval(durationRef.current);
        // Stop mic
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100); // collect in 100ms chunks
      setIsRecording(true);
      setPhase('recording');
      setRecordingDuration(0);

      // Duration counter
      const dStart = Date.now();
      durationRef.current = window.setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - dStart) / 1000));
      }, 200);

      // Auto-stop after maxRecordingMs
      timerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, maxRecordingMs);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg);
      setPhase('failed');
      onError?.(msg);
    }
  }, [enabled, phase, maxRecordingMs, onError]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const getAudioBlob = useCallback(() => audioBlobRef.current, []);

  const retry = useCallback(() => {
    setPhase('idle');
    setChallengeDigits(null);
    setExpiresIn(null);
    setError(null);
    setResult(null);
    setRecordingDuration(0);
    audioBlobRef.current = null;
    chunksRef.current = [];
    if (expiryTimerRef.current) clearInterval(expiryTimerRef.current);
  }, []);

  return {
    phase,
    challengeDigits,
    expiresIn,
    isRecording,
    recordingDuration,
    error,
    result,
    requestChallenge,
    startRecording,
    stopRecording,
    getAudioBlob,
    retry,
    // Expose setter for DemoPage to push API challenge data into the hook
    setChallengeFromApi,
  } as UseVoiceCaptureReturn & { setChallengeFromApi: (digits: string, expiresIn: number) => void };
}
