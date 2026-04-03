import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { API_BASE_URL, shouldUseSandbox } from '../config/api';
import {
  CameraIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { ActiveLivenessCapture } from '../components/liveness/ActiveLivenessCapture';
import type { LivenessMetadata } from '../hooks/useActiveLiveness';
import { C, injectFonts } from '../theme';
import '../styles/patterns.css';

import {
  ProgressIndicator,
  DemoInitStep,
  FrontDocumentStep,
  ProcessingStep,
  BackUploadStep,
  CheckingStep,
  LiveCaptureStep,
  ResultsStep,
  AddressStep,
  getErrorMessage,
} from '../components/demo';
import type { VerificationRequest, CaptureResult } from '../components/demo';
import { injectDemoCSS } from '../components/demo/DemoShared';

// OpenCV types
declare global {
  interface Window {
    cv: any;
  }
}

const DemoPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlApiKey = searchParams.get('api_key');
  const urlStep = searchParams.get('step');
  const urlVerificationId = searchParams.get('verification_id');

  const [currentStep, setCurrentStep] = useState(urlStep ? parseInt(urlStep) : 1);
  const [verificationRequest, setVerificationRequest] = useState<VerificationRequest | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [_uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string>('');
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [checkingStepError, setCheckingStepError] = useState<string | null>(null);

  // Demo form fields
  const [apiKey, setApiKey] = useState(urlApiKey || '');
  const [userId, setUserId] = useState('');
  const [verificationMode, setVerificationMode] = useState<'full' | 'document_only' | 'identity' | 'age_only'>('full');
  const [ageThreshold, setAgeThreshold] = useState(18);
  const isAgeOnly = verificationMode === 'age_only';
  const isDocumentOnly = verificationMode === 'document_only';
  const isIdentity = verificationMode === 'identity';
  // Display-step count (UI screens), not backend pipeline gate count
  const totalSteps = isAgeOnly ? 3 : isDocumentOnly ? 5 : isIdentity ? 4 : 6;

  // Live capture state
  const [showLiveCapture, setShowLiveCapture] = useState(false);
  const [useFallbackCapture, setUseFallbackCapture] = useState(false);
  const [_captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [cameraState, setCameraState] = useState<'prompt' | 'initializing' | 'ready' | 'error'>('prompt');
  const [_challengeState, setChallengeState] = useState<'waiting' | 'active' | 'completed'>('waiting');
  const [faceDetected, setFaceDetected] = useState(false);
  const [opencvReady, setOpencvReady] = useState(false);
  const [_faceDetectionBuffer, setFaceDetectionBuffer] = useState<boolean[]>([]);
  const [mobileHandoffDone, setMobileHandoffDone] = useState(false);
  const [mobileResult, setMobileResult] = useState<any>(null);
  const [retryProcessing, setRetryProcessing] = useState(false);

  // Responsive layout
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );

  // Address verification state
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const [addressPreview, setAddressPreview] = useState<string | null>(null);
  const [addressDocType, setAddressDocType] = useState<string>('utility_bill');
  const [addressResult, setAddressResult] = useState<any>(null);
  const [addressUploading, setAddressUploading] = useState(false);

  // Refs for live capture
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const faceClassifierRef = useRef<any>(null);
  const ocrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ocrPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crossValPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crossValTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Lifecycle Effects ──────────────────────────────────────

  // Auto-generate user ID on component mount
  useEffect(() => {
    if (!userId) {
      const newUserId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      setUserId(newUserId);
    }
  }, []); // Only run once on mount

  // Inject brand fonts + demo CSS animations
  useEffect(() => { injectFonts(); injectDemoCSS(); }, []);

  // Track viewport width for responsive grids
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Load OpenCV script when needed
  useEffect(() => {
    if (showLiveCapture && !opencvReady) {
      // Check if OpenCV is already available globally
      if (window.cv && window.cv.Mat) {
        console.log('OpenCV already available, initializing...');
        setOpencvReady(true);
        loadFaceClassifier();
        return;
      }

      // Load OpenCV script if not already loaded
      if (!document.getElementById('opencv-script')) {
        const script = document.createElement('script');
        script.id = 'opencv-script';
        script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
        script.async = true;
        script.onload = () => {
          console.log('OpenCV script loaded');
          // Add delay to ensure OpenCV is fully initialized
          setTimeout(() => {
            initOpenCV();
          }, 100);
        };
        script.onerror = () => {
          console.error('Failed to load OpenCV script');
          setOpencvReady(false);
        };
        document.head.appendChild(script);
      } else {
        // Script already loaded, check if OpenCV is ready
        setTimeout(() => {
          initOpenCV();
        }, 100);
      }
    }

    return () => {
      if (!showLiveCapture) {
        cleanup();
      }
    };
  }, [showLiveCapture]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanup();
      stopOCRPolling();
      stopCrossValPolling();
    };
  }, []);

  // Load verification results when coming from live capture
  useEffect(() => {
    if (urlVerificationId && apiKey && currentStep === 7) {
      loadVerificationResults(urlVerificationId);
    }
  }, [urlVerificationId, apiKey, currentStep]);

  // ── OpenCV / Face Detection Logic ──────────────────────────

  const initOpenCV = () => {
    if (window.cv && window.cv.Mat) {
      console.log('OpenCV ready for live capture');
      setOpencvReady(true);
      loadFaceClassifier();
    } else {
      console.log('Waiting for OpenCV to be ready...');
      setTimeout(initOpenCV, 200);
    }
  };

  const loadFaceClassifier = async () => {
    if (!window.cv || !opencvReady) return;

    try {
      const faceCascadeFile = '/models/haarcascade_frontalface_default.xml';

      const response = await fetch(faceCascadeFile);
      if (!response.ok) {
        console.warn('Face classifier file not found, using basic detection');
        console.log('OpenCV ready without face classifier - using basic detection');
        return;
      }

      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);
      window.cv.FS_createDataFile('/', 'haarcascade_frontalface_default.xml', data, true, false, false);
      faceClassifierRef.current = new window.cv.CascadeClassifier();
      const loaded = faceClassifierRef.current.load('haarcascade_frontalface_default.xml');

      if (loaded) {
        console.log('Face classifier loaded successfully');
      } else {
        console.warn('Face classifier failed to load, using basic detection');
        faceClassifierRef.current = null;
      }
    } catch (error) {
      console.error('Face classifier loading failed:', error);
      faceClassifierRef.current = null;
      console.log('Continuing with basic detection');
    }
  };

  const cleanup = () => {
    console.log('Starting cleanup...');

    // Stop all media tracks
    if (streamRef.current) {
      console.log('Stopping camera tracks...');
      streamRef.current.getTracks().forEach(track => {
        console.log(`Stopping track: ${track.kind}, state: ${track.readyState}`);
        track.stop();
      });
      streamRef.current = null;
    }

    // Cancel face detection animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      console.log('Face detection animation cancelled');
    }

    // Clean up video element
    if (videoElementRef.current) {
      console.log('Cleaning up video element...');
      videoElementRef.current.srcObject = null;
      videoElementRef.current.pause();
      videoElementRef.current = null;
    }

    // Reset camera state
    setCameraState('prompt');

    // Reset face detection state
    setFaceDetected(false);
    setFaceDetectionBuffer([]);

    // Reset OpenCV state
    setOpencvReady(false);
    faceClassifierRef.current = null;

    console.log('Cleanup completed');
  };

  const initializeCamera = async () => {
    console.log('Initializing camera...');
    setCameraState('initializing');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported in this browser');
      }

      console.log('Requesting camera permissions...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, min: 320, max: 1280 },
          height: { ideal: 480, min: 240, max: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      console.log('Camera stream obtained', {
        tracks: stream.getTracks().length,
        videoTracks: stream.getVideoTracks().length
      });

      streamRef.current = stream;
      setCameraState('ready');

      // Reset face detection state for new session
      setFaceDetected(false);
      setFaceDetectionBuffer([]);

      // Wait for the UI to render the video element, then connect the stream
      setTimeout(() => {
        if (videoElementRef.current) {
          console.log('Connecting stream to video element...');
          videoElementRef.current.srcObject = stream;

          videoElementRef.current.onloadedmetadata = () => {
            console.log('Video metadata loaded, starting playback...');
            if (videoElementRef.current) {
              videoElementRef.current.play().then(() => {
                console.log('Video playing, starting face detection...');
                setTimeout(() => {
                  startFaceDetection();
                }, 1000);
              }).catch(error => {
                console.error('Video play failed:', error);
                toast.error('Failed to start video playback');
              });
            }
          };

          videoElementRef.current.onerror = (error) => {
            console.error('Video element error:', error);
            toast.error('Video playback error');
          };
        } else {
          console.warn('Video element not found in DOM yet, retrying...');
          setTimeout(() => {
            if (videoElementRef.current) {
              videoElementRef.current.srcObject = stream;
            }
          }, 500);
        }
      }, 100);

    } catch (error) {
      console.error('Camera initialization failed:', error);
      setCameraState('error');

      const err = error as { name?: string; message?: string };
      if (err.name === 'NotAllowedError') {
        toast.error('Camera access denied. Please allow camera permissions and try again.');
      } else if (err.name === 'NotFoundError') {
        toast.error('No camera found. Please connect a camera and try again.');
      } else if (err.name === 'NotReadableError') {
        toast.error('Camera is being used by another application.');
      } else {
        toast.error(`Camera error: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const startFaceDetection = () => {
    console.log('Starting face detection...', {
      hasVideo: !!videoElementRef.current,
      hasCanvas: !!canvasRef.current,
      hasOpenCV: !!window.cv,
      hasClassifier: !!faceClassifierRef.current,
      cameraState
    });

    console.log('FACE DETECTION LOOP STARTING NOW!');

    if (!videoElementRef.current || !canvasRef.current) {
      console.warn('Missing video or canvas element for face detection, retrying in 200ms...');
      setTimeout(() => {
        if (cameraState === 'ready' && videoElementRef.current && canvasRef.current) {
          startFaceDetection();
        }
      }, 200);
      return;
    }

    const detectFaces = () => {
      if (!videoElementRef.current || !canvasRef.current) {
        console.warn('Early return from detectFaces - missing elements:', {
          hasVideo: !!videoElementRef.current,
          hasCanvas: !!canvasRef.current,
          cameraState: cameraState
        });

        if (cameraState === 'ready' || showLiveCapture) {
          setTimeout(() => {
            if (cameraState === 'ready' || showLiveCapture) {
              animationRef.current = requestAnimationFrame(detectFaces);
            }
          }, 100);
        }
        return;
      }

      if (!showLiveCapture) {
        console.warn('Early return from detectFaces - live capture not active');
        return;
      }

      try {
        const video = videoElementRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          console.warn('No canvas context available');
          animationRef.current = requestAnimationFrame(detectFaces);
          return;
        }

        if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
          console.log('Video not ready yet:', {
            readyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
          });
          animationRef.current = requestAnimationFrame(detectFaces);
          return;
        }

        const displayWidth = video.clientWidth || 640;
        const displayHeight = video.clientHeight || 480;

        const canvasWidth = Math.max(displayWidth, 320);
        const canvasHeight = Math.max(displayHeight, 240);

        if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          console.log('Canvas resized to match video display:', {
            width: canvasWidth,
            height: canvasHeight,
            videoDisplay: `${displayWidth}x${displayHeight}`,
            videoClient: `${video.clientWidth}x${video.clientHeight}`
          });
        }

        if (Math.random() < 0.1) {
          console.log('Face detection loop running:', {
            canvasSize: `${canvas.width}x${canvas.height}`,
            videoSize: `${video.videoWidth}x${video.videoHeight}`,
            displaySize: `${displayWidth}x${displayHeight}`
          });
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) * 0.3;

        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 6;
        ctx.setLineDash([15, 10]);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(10, 10, 320, 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('Position your face in the blue circle', 20, 30);

        let faceCount = 0;

        if (window.cv && window.cv.Mat && faceClassifierRef.current && opencvReady) {
          console.log('OPENCV: Attempting OpenCV face detection');
          try {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');

            if (tempCtx) {
              const videoWidth = video.videoWidth;
              const videoHeight = video.videoHeight;
              tempCanvas.width = videoWidth;
              tempCanvas.height = videoHeight;

              tempCtx.drawImage(video, 0, 0, videoWidth, videoHeight);
              const imageData = tempCtx.getImageData(0, 0, videoWidth, videoHeight);

              const src = window.cv.matFromImageData(imageData);
              const gray = new window.cv.Mat();
              const faces = new window.cv.RectVector();

              window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);
              faceClassifierRef.current.detectMultiScale(gray, faces, 1.05, 2, 0, new window.cv.Size(30, 30));

              faceCount = faces.size();
              console.log(`OPENCV: Detected ${faceCount} faces`);

              try {
                src.delete();
                gray.delete();
                faces.delete();
              } catch (cleanupError) {
                console.warn('OpenCV cleanup error:', cleanupError);
              }
            }

          } catch (cvError) {
            console.warn('OpenCV face detection error:', cvError);
          }
        } else {
          // Improved fallback: basic brightness-based face detection
          try {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) throw new Error('Could not get temp canvas context');

            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;

            tempCtx.drawImage(video, 0, 0);

            const faceRegionSize = Math.min(video.videoWidth, video.videoHeight) * 0.4;
            const startX = (video.videoWidth - faceRegionSize) / 2;
            const startY = (video.videoHeight - faceRegionSize) / 2;

            const imageData = tempCtx.getImageData(startX, startY, faceRegionSize, faceRegionSize);
            const pixels = imageData.data;

            let totalBrightness = 0;
            let skinTonePixels = 0;
            const pixelCount = pixels.length / 4;

            for (let i = 0; i < pixels.length; i += 4) {
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];

              const brightness = (r + g + b) / 3;
              totalBrightness += brightness;

              const isLightSkin = r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15;
              const isMediumSkin = r > 80 && g > 50 && b > 30 && r >= g && brightness > 60;
              const isDarkSkin = r > 60 && g > 40 && b > 25 && Math.abs(r - g) < 30 && brightness > 40;

              if ((isLightSkin || isMediumSkin || isDarkSkin) && brightness > 30 && brightness < 250) {
                skinTonePixels++;
              }
            }

            const avgBrightness = totalBrightness / pixelCount;
            const skinToneRatio = skinTonePixels / pixelCount;

            const hasFaceFeatures = skinToneRatio > 0.02 && avgBrightness > 30 && avgBrightness < 240;
            faceCount = hasFaceFeatures ? 1 : 0;

            console.log('FALLBACK Face detection:', {
              faceCount,
              skinToneRatio: skinToneRatio.toFixed(3),
              avgBrightness: avgBrightness.toFixed(1),
              skinTonePixels,
              totalPixels: pixelCount,
              hasFaceFeatures,
              opencvReady,
              faceRegionSize: Math.round(faceRegionSize)
            });

            if (faceCount > 0) {
              const detectionSize = radius * 0.8;
              ctx.strokeStyle = '#00ff00';
              ctx.lineWidth = 4;
              ctx.strokeRect(centerX - detectionSize/2, centerY - detectionSize/2, detectionSize, detectionSize);
              ctx.fillStyle = '#00ff00';
              ctx.font = 'bold 16px Arial';
              ctx.fillText('FACE DETECTED', centerX - detectionSize/2, centerY - detectionSize/2 - 15);
            }
          } catch (fallbackError) {
            console.warn('Fallback face detection error:', fallbackError);
            faceCount = 0;
          }
        }

        const currentDetection = faceCount > 0;
        setFaceDetectionBuffer(prev => {
          const newBuffer = [...prev, currentDetection].slice(-5);

          const trueCount = newBuffer.filter(Boolean).length;
          const falseCount = newBuffer.filter(x => !x).length;

          if (trueCount >= 3 && !faceDetected) {
            setFaceDetected(true);
          } else if (falseCount >= 3 && faceDetected) {
            setFaceDetected(false);
          }

          return newBuffer;
        });

      } catch (error) {
        console.error('Face detection error:', error);
      }

      animationRef.current = requestAnimationFrame(detectFaces);
    };

    console.log('Starting face detection animation loop');
    animationRef.current = requestAnimationFrame(detectFaces);
  };

  // ── API Handlers ───────────────────────────────────────────

  const loadVerificationResults = async (verId: string) => {
    try {
      const url = new URL(`${API_BASE_URL}/api/v2/verify/${verId}/status`);
      if (shouldUseSandbox()) {
        url.searchParams.append('sandbox', 'true');
      }

      const response = await fetch(url.toString(), {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (response.ok) {
        const data = await response.json();

        // Infer final_result for mode-specific flows when the backend doesn't set it
        // (defensive: covers stale backend builds missing FLOW_PRESETS for newer modes)
        if (!data.final_result && data.verification_mode) {
          if (data.verification_mode === 'document_only' && data.cross_validation_results) {
            const cv = data.cross_validation_results;
            data.final_result = cv.has_critical_failure ? 'failed'
              : cv.verdict === 'REVIEW' ? 'manual_review'
              : cv.verdict === 'REJECT' ? 'failed'
              : 'verified';
          } else if (data.verification_mode === 'identity' && data.face_match_results) {
            data.final_result = data.face_match_results.skipped_reason ? 'manual_review' : 'verified';
          }
        }

        setVerificationRequest(data);
        setVerificationId(verId);
      }
    } catch (error) {
      console.error('Failed to load verification results:', error);
    }
  };

  const handleRetry = async () => {
    if (!verificationId) return;
    setRetryProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/restart`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to restart' }));
        throw new Error(err.message || 'Failed to restart verification');
      }
      cleanup();
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setVerificationRequest(null);
      setShowLiveCapture(false);
      setUseFallbackCapture(false);
      setCaptureResult(null);
      setCameraState('prompt');
      setFaceDetected(false);
      setMobileHandoffDone(false);
      setMobileResult(null);
      setBackFile(null);
      if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
      setBackPreviewUrl(null);
      setCheckingStepError(null);
      setCurrentStep(2);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restart verification');
    } finally {
      setRetryProcessing(false);
    }
  };

  const startVerification = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your API key');
      return;
    }

    if (!userId.trim()) {
      toast.error('Please enter a user ID');
      return;
    }

    setIsLoading(true);
    try {
      const useSandbox = shouldUseSandbox();
      const requestBody = {
        user_id: userId,
        source: 'demo' as const,
        ...(useSandbox && { sandbox: true }),
        ...(verificationMode !== 'full' && { verification_mode: verificationMode }),
        ...(verificationMode === 'age_only' && { age_threshold: ageThreshold }),
      };

      console.log('Start Verification Debug:');
      console.log('Sandbox mode:', useSandbox);
      console.log('API Key (first 10):', apiKey?.substring(0, 10));
      console.log('Request body:', requestBody);

      const response = await fetch(`${API_BASE_URL}/api/v2/verify/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Start verification response status:', response.status);

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const errorData = contentType.includes('application/json')
          ? await response.json()
          : { message: await response.text() };
        console.log('Start verification error response:', errorData);
        throw new Error(getErrorMessage(errorData, 'Failed to start verification'));
      }

      const data = await response.json();
      setVerificationId(data.verification_id);
      setCurrentStep(2);
      toast.success('Verification session started');
    } catch (error) {
      console.error('Failed to start verification:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start verification');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a JPEG, PNG, or PDF file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const uploadDocument = async () => {
    if (!selectedFile || !verificationId) {
      toast.error('Please select a file first');
      return;
    }

    setIsLoading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('document', selectedFile);
      formData.append('document_type', documentType || 'national_id');

      const useSandbox = shouldUseSandbox();

      const url = new URL(`${API_BASE_URL}/api/v2/verify/${verificationId}/front-document`);
      if (useSandbox) {
        url.searchParams.append('sandbox', 'true');
      }

      console.log('Document Upload Debug:');
      console.log('Sandbox mode:', useSandbox);
      console.log('API Key (first 10):', apiKey?.substring(0, 10));
      console.log('Verification ID:', verificationId);
      console.log('Upload URL:', url.toString());
      console.log('FormData entries:', Array.from(formData.entries()).map(([key, value]) =>
        key === 'document' ? [key, `${value.constructor.name} (${(value as File).size} bytes)`] : [key, value]
      ));

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
        },
        body: formData,
      });

      console.log('Upload response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.log('Upload error response:', errorData);
        throw new Error(errorData.error || errorData.message || 'Failed to upload document');
      }

      const data = await response.json();

      if (data.rejection_reason) {
        toast.error(data.message || data.rejection_reason);
        return;
      }

      // Age-only mode: front-document response includes final result directly
      if (isAgeOnly && data.age_verification) {
        setVerificationRequest(data);
        setCurrentStep(7);
        toast.success(data.age_verification.is_of_age ? 'Age verified!' : 'Age verification failed');
        return;
      }

      setCurrentStep(3);
      toast.success('Document uploaded successfully');

      pollForOCRResults();
    } catch (error) {
      console.error('Failed to upload document:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload document');
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  const stopOCRPolling = () => {
    if (ocrPollRef.current) { clearInterval(ocrPollRef.current); ocrPollRef.current = null; }
    if (ocrPollTimeoutRef.current) { clearTimeout(ocrPollTimeoutRef.current); ocrPollTimeoutRef.current = null; }
  };

  const pollForOCRResults = () => {
    stopOCRPolling();

    ocrPollRef.current = setInterval(async () => {
      try {
        const url = new URL(`${API_BASE_URL}/api/v2/verify/${verificationId}/status`);
        if (shouldUseSandbox()) {
          url.searchParams.append('sandbox', 'true');
        }

        const response = await fetch(url.toString(), {
          headers: {
            'X-API-Key': apiKey,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setVerificationRequest(data);

          const status = (data.status || '').toLowerCase();
          if (status === 'hard_rejected' || status === 'failed') {
            stopOCRPolling();
            toast.error(data.rejection_reason || data.failure_reason || 'Document verification failed');
            return;
          }

          if (data.ocr_data && Object.keys(data.ocr_data).length > 0) {
            stopOCRPolling();
            // identity flow: skip back doc → go straight to live capture
            if (isIdentity) {
              setCurrentStep(6);
            } else {
              setCurrentStep(4); // back upload (full and document_only)
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);

    ocrPollTimeoutRef.current = setTimeout(() => stopOCRPolling(), 30000);
  };

  // ── Back document upload (new separate step) ────────────────
  const handleBackFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a valid image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }
    setBackFile(file);
    if (file.type.startsWith('image/')) {
      if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
      setBackPreviewUrl(URL.createObjectURL(file));
    }
  };

  const uploadBackDocument = async () => {
    if (!backFile || !verificationId) {
      toast.error('Please select a file first');
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('document', backFile);
      formData.append('document_type', documentType || 'national_id');

      const url = new URL(`${API_BASE_URL}/api/v2/verify/${verificationId}/back-document`);
      if (shouldUseSandbox()) url.searchParams.append('sandbox', 'true');

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to upload back document');
      }

      const data = await response.json();
      if (data.rejection_reason || data.status === 'failed') {
        toast.error(data.rejection_detail || data.rejection_reason || 'Cross-validation failed');
        setVerificationRequest(data);
        setCurrentStep(7); // Results (failed)
        return;
      }

      // document_only: backend may return final result after crossval
      if (data.final_result || data.status === 'verified' || data.status === 'manual_review') {
        setVerificationRequest(data);
        setCurrentStep(7);
        toast.success('Document verification complete');
        return;
      }

      setCurrentStep(5); // Checking step
      pollCrossValidation();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload back document');
    } finally {
      setIsLoading(false);
    }
  };

  const stopCrossValPolling = () => {
    if (crossValPollRef.current) { clearInterval(crossValPollRef.current); crossValPollRef.current = null; }
    if (crossValTimeoutRef.current) { clearTimeout(crossValTimeoutRef.current); crossValTimeoutRef.current = null; }
  };

  const pollCrossValidation = () => {
    stopCrossValPolling();
    setCheckingStepError(null);

    crossValPollRef.current = setInterval(async () => {
      try {
        const url = new URL(`${API_BASE_URL}/api/v2/verify/${verificationId}/status`);
        if (shouldUseSandbox()) url.searchParams.append('sandbox', 'true');

        const response = await fetch(url.toString(), {
          headers: { 'X-API-Key': apiKey },
        });

        if (response.ok) {
          const data = await response.json();
          setVerificationRequest(data);

          const status = (data.status || '').toLowerCase();
          if (status === 'failed' || status === 'hard_rejected') {
            stopCrossValPolling();
            setCurrentStep(7); // Results (failed)
            return;
          }

          // document_only: crossval complete means verification done.
          // Check final_result first; fallback to inferring from cross-validation results
          // (defensive: covers stale backend builds where FLOW_PRESETS may be missing).
          if (isDocumentOnly && (status === 'verified' || status === 'manual_review' || status === 'complete' || data.final_result !== null)) {
            stopCrossValPolling();
            setVerificationRequest(data);
            setCurrentStep(7);
            return;
          }
          if (isDocumentOnly && data.cross_validation_results) {
            stopCrossValPolling();
            const verdict = data.cross_validation_results.verdict;
            const hasCriticalFailure = data.cross_validation_results.has_critical_failure;
            setVerificationRequest({
              ...data,
              final_result: hasCriticalFailure ? 'failed'
                : verdict === 'REVIEW' ? 'manual_review'
                : verdict === 'REJECT' ? 'failed'
                : 'verified',
            });
            setCurrentStep(7);
            return;
          }

          // Cross-validation done when results present or pipeline advanced past it
          if (data.cross_validation_results || status === 'awaiting_live' || status === 'face_matching') {
            stopCrossValPolling();
            setCurrentStep(6); // Live capture
          }
        }
      } catch (error) {
        console.error('Cross-validation polling error:', error);
      }
    }, 2000);

    // Timeout after 60s
    crossValTimeoutRef.current = setTimeout(() => {
      stopCrossValPolling();
      setCheckingStepError('Validation timed out. Please try again.');
    }, 60000);
  };

  const captureSelfie = async () => {
    if (!videoElementRef.current || !apiKey || !verificationId) {
      toast.error('Camera not ready or missing credentials');
      return;
    }

    if (!faceDetected) {
      toast.error('Please position your face within the frame');
      return;
    }

    setChallengeState('active');
    setIsLoading(true);

    try {
      const video = videoElementRef.current;
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;

      const captureCtx = captureCanvas.getContext('2d');
      if (!captureCtx) {
        throw new Error('Failed to create capture context');
      }

      captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        captureCanvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        }, 'image/jpeg', 0.8);
      });

      if (!blob) {
        throw new Error('Failed to capture image');
      }

      const formData = new FormData();
      formData.append('selfie', blob, 'selfie.jpg');

      console.log('Capturing selfie...', { verificationId });

      const response = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/live-capture`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Live capture failed');
      }

      const result = await response.json();
      setCaptureResult(result);
      setChallengeState('completed');

      toast.success('Selfie captured successfully!');

      console.log('Selfie captured, cleaning up camera...');
      cleanup();

      setShowLiveCapture(false);

      setTimeout(() => {
        loadVerificationResults(verificationId);
        setCurrentStep(7);
      }, 1000);

    } catch (error) {
      console.error('Selfie capture failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to capture selfie');
      setChallengeState('waiting');

      console.log('Selfie capture failed, cleaning up camera...');
      cleanup();
      setShowLiveCapture(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLiveCapture = async () => {
    if (!apiKey || !verificationId) {
      toast.error('Please start verification session and upload document first');
      return;
    }

    setShowLiveCapture(true);
    setCameraState('prompt');
  };

  const skipLiveCapture = async () => {
    try {
      const url = new URL(`${API_BASE_URL}/api/v2/verify/${verificationId}/status`);
      if (shouldUseSandbox()) {
        url.searchParams.append('sandbox', 'true');
      }

      const response = await fetch(url.toString(), {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get verification results');
      }

      const data = await response.json();
      setVerificationRequest(data);
      setCurrentStep(7);
      toast.success('Verification completed without live capture');
    } catch (error) {
      console.error('Failed to get verification results:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to get verification results');
    }
  };

  const handleActiveLivenessComplete = async (blob: Blob, metadata: LivenessMetadata) => {
    if (!apiKey || !verificationId) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('selfie', blob, 'selfie.jpg');
      formData.append('liveness_metadata', JSON.stringify(metadata));

      const response = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/live-capture`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Live capture failed');
      }

      const result = await response.json();
      setCaptureResult(result);
      setChallengeState('completed');
      toast.success('Liveness verified!');
      setShowLiveCapture(false);
      setTimeout(() => {
        loadVerificationResults(verificationId);
        setCurrentStep(7);
      }, 1000);
    } catch (error) {
      console.error('Active liveness submission failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to verify liveness');
      setShowLiveCapture(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Address handlers
  const handleAddressFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a JPEG, PNG, or PDF file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }
    setAddressFile(file);
    if (file.type.startsWith('image/')) {
      setAddressPreview(URL.createObjectURL(file));
    } else {
      setAddressPreview(null);
    }
  };

  const uploadAddressDocument = async () => {
    if (!addressFile || !verificationId) {
      toast.error('Please select a file first');
      return;
    }
    setAddressUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', addressFile);
      formData.append('document_type', addressDocType);

      const url = new URL(`${API_BASE_URL}/api/v2/verify/${verificationId}/address-document`);
      if (shouldUseSandbox()) {
        url.searchParams.append('sandbox', 'true');
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(getErrorMessage(errorData, 'Failed to upload address document'));
      }

      const data = await response.json();
      setAddressResult(data.address_verification);
      toast.success('Address document processed');
    } catch (error) {
      console.error('Address upload failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload address document');
    } finally {
      setAddressUploading(false);
    }
  };

  // ── Navigation helpers ─────────────────────────────────────

  const handleStartNew = () => {
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('verification_id');
    newUrl.searchParams.delete('step');
    newUrl.searchParams.set('step', '1');
    window.location.href = newUrl.toString();
  };

  const handleMobileVerificationComplete = (verId: string) => {
    setVerificationId(verId);
    loadVerificationResults(verId);
    setCurrentStep(7);
  };

  // ── Render Live Capture (stays in parent — refs are tightly coupled) ──

  const renderLiveCapture = () => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>Live Capture</h3>
        <button
          onClick={() => { cleanup(); setShowLiveCapture(false); setUseFallbackCapture(false); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4, display: 'flex' }}
        >
          <XMarkIcon style={{ width: 18, height: 18 }} />
        </button>
      </div>

      {/* Primary: Active liveness with multi-frame color challenge */}
      {!useFallbackCapture && (
        <ActiveLivenessCapture
          onComplete={handleActiveLivenessComplete}
          onCancel={() => { cleanup(); setShowLiveCapture(false); setUseFallbackCapture(false); }}
          onFallback={() => setUseFallbackCapture(true)}
        />
      )}

      {/* Fallback: legacy OpenCV-based camera capture */}
      {useFallbackCapture && (
        <>
          {cameraState === 'prompt' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <CameraIcon style={{ width: 40, height: 40, margin: '0 auto 12px', color: C.cyan }} />
              <h4 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>Ready for Live Capture</h4>
              <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>We'll use your camera to take a selfie for identity verification.</p>
              <button
                onClick={initializeCamera}
                style={{ background: C.cyan, color: C.bg, border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Start Camera
              </button>
            </div>
          )}

          {cameraState === 'initializing' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div className="animate-spin" style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${C.border}`, borderTopColor: C.cyan, margin: '0 auto 12px' }} />
              <p style={{ color: C.muted, fontSize: 13 }}>Initializing camera...</p>
            </div>
          )}

          {cameraState === 'ready' && (
            <div>
              <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', minHeight: 240, height: 320, marginBottom: 16 }}>
                <video
                  ref={videoElementRef}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000', borderRadius: 8 }}
                  onLoadedMetadata={() => {
                    if (videoElementRef.current) {
                      videoElementRef.current.play().catch(err => { console.error('Video play error:', err); });
                    }
                  }}
                  onError={(e) => { console.error('Video element error:', e); }}
                />
                <canvas
                  ref={canvasRef}
                  style={{ display: 'block', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', backgroundColor: 'transparent', zIndex: 20 }}
                />
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: faceDetected ? 'rgba(52,211,153,0.85)' : 'rgba(248,113,113,0.85)', borderRadius: 20, padding: '4px 10px', fontSize: 12, color: '#fff', fontWeight: 500 }}>
                    <EyeIcon style={{ width: 14, height: 14 }} />
                    <span>{faceDetected ? 'Face Detected' : 'No Face'}</span>
                  </div>
                </div>
                <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
                  <div style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '8px 12px', borderRadius: 6, textAlign: 'center', fontSize: 12 }}>
                    {!faceDetected ? 'Position your face within the circle' : 'Great! Click capture when ready'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={captureSelfie}
                  disabled={!faceDetected || isLoading}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: !faceDetected || isLoading ? 'not-allowed' : 'pointer', border: 'none', background: !faceDetected || isLoading ? C.surface : C.green, color: !faceDetected || isLoading ? C.dim : C.bg, transition: 'all 0.2s' }}
                >
                  {isLoading ? 'Capturing...' : 'Capture Selfie'}
                </button>
                <button
                  onClick={() => { cleanup(); setShowLiveCapture(false); setUseFallbackCapture(false); }}
                  style={{ padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer', border: `1px solid ${C.border}`, background: 'transparent', color: C.muted }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {cameraState === 'error' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <ExclamationTriangleIcon style={{ width: 40, height: 40, margin: '0 auto 12px', color: C.red }} />
              <h4 style={{ fontSize: 15, fontWeight: 600, color: C.red, marginBottom: 8 }}>Camera Error</h4>
              <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Unable to access your camera. Please check permissions and try again.</p>
              <button
                onClick={initializeCamera}
                style={{ background: C.cyan, color: C.bg, border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                Try Again
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ── Step Content Rendering ─────────────────────────────────

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <DemoInitStep
            apiKey={apiKey}
            userId={userId}
            isLoading={isLoading}
            isMobile={isMobile}
            mobileHandoffDone={mobileHandoffDone}
            mobileResult={mobileResult}
            verificationMode={verificationMode}
            ageThreshold={ageThreshold}
            onApiKeyChange={setApiKey}
            onUserIdChange={setUserId}
            onVerificationModeChange={setVerificationMode}
            onAgeThresholdChange={setAgeThreshold}
            onStart={startVerification}
            onMobileHandoffDone={setMobileHandoffDone}
            onMobileResult={setMobileResult}
            onMobileVerificationComplete={handleMobileVerificationComplete}
          />
        );

      case 2:
        return (
          <FrontDocumentStep
            selectedFile={selectedFile}
            previewUrl={previewUrl}
            documentType={documentType}
            isLoading={isLoading}
            isAgeOnly={isAgeOnly}
            ageThreshold={ageThreshold}
            totalSteps={totalSteps}
            onFileSelect={handleFileSelect}
            onDocumentTypeChange={setDocumentType}
            onUpload={uploadDocument}
          />
        );

      case 3:
        return <ProcessingStep />;

      case 4:
        return (
          <BackUploadStep
            verificationRequest={verificationRequest}
            backFile={backFile}
            backPreviewUrl={backPreviewUrl}
            isLoading={isLoading}
            totalSteps={totalSteps}
            onBackFileSelect={handleBackFileSelect}
            onUpload={uploadBackDocument}
          />
        );

      case 5:
        return <CheckingStep stepError={checkingStepError} onRetry={pollCrossValidation} step={4} totalSteps={totalSteps} />;

      case 6:
        // If ActiveLiveness triggered fallback, render the legacy camera UI
        if (showLiveCapture && useFallbackCapture) {
          return renderLiveCapture();
        }
        return (
          <LiveCaptureStep
            isProcessing={isLoading}
            showActiveLiveness={showLiveCapture}
            onStartLiveness={handleLiveCapture}
            onSkipLiveCapture={skipLiveCapture}
            step={isIdentity ? 3 : 5}
            totalSteps={totalSteps}
            renderActiveLiveness={() => (
              <ActiveLivenessCapture
                onComplete={handleActiveLivenessComplete}
                onCancel={() => { cleanup(); setShowLiveCapture(false); }}
                onFallback={() => setUseFallbackCapture(true)}
                isProcessing={isLoading}
              />
            )}
          />
        );

      case 7:
        if (!verificationRequest) return null;
        return (
          <ResultsStep
            verificationRequest={verificationRequest}
            isMobile={isMobile}
            retryProcessing={retryProcessing}
            onRetry={handleRetry}
            onStartNew={handleStartNew}
            onGoToAddress={() => setCurrentStep(8)}
          />
        );

      case 8:
        return (
          <AddressStep
            addressFile={addressFile}
            addressPreview={addressPreview}
            addressDocType={addressDocType}
            addressResult={addressResult}
            addressUploading={addressUploading}
            onAddressFileSelect={handleAddressFileSelect}
            onAddressDocTypeChange={setAddressDocType}
            onUploadAddress={uploadAddressDocument}
            onStartNew={handleStartNew}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="pattern-guilloche pattern-faint pattern-fade-edges pattern-full" style={{ background: C.bg, fontFamily: C.sans, color: C.text, minHeight: '100vh' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.08em', marginBottom: 24 }}>
          idswyft / live-demo
        </div>
        <h1 style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 600, color: C.text, marginBottom: 8 }}>
          Live Demo
        </h1>
        <p style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>
          Try a complete verification with a sandbox key. No signup required.
        </p>
        <div style={{
          background: 'rgba(34,211,238,0.04)',
          border: `1px solid rgba(34,211,238,0.12)`,
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 36,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}>
          <svg style={{ width: 16, height: 16, color: C.cyan, flexShrink: 0, marginTop: 1 }} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: 0, fontFamily: C.sans }}>
            <strong style={{ color: C.text, fontWeight: 500 }}>Privacy notice:</strong>{' '}
            All documents and images uploaded during this demo are automatically deleted
            within 24 hours. No biometric data is stored beyond the verification session.
          </p>
        </div>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: isMobile ? 16 : 32 }}>
          <ProgressIndicator
            currentStep={(() => {
              if (isAgeOnly) {
                if (currentStep >= 7) return 3;
                if (currentStep >= 2) return 2;
                return 1;
              }
              if (isDocumentOnly) {
                // 5 display steps: Start(1), Front(2), Back(3), Checking(4), Results(5)
                const map: Record<number, number> = { 1:1, 2:2, 3:2, 4:3, 5:4, 7:5, 8:5 };
                return map[currentStep] || 1;
              }
              if (isIdentity) {
                // 4 display steps: Start(1), Front(2), Live(3), Results(4)
                const map: Record<number, number> = { 1:1, 2:2, 3:2, 6:3, 7:4, 8:4 };
                return map[currentStep] || 1;
              }
              // Full flow: 6 display steps
              const map: Record<number, number> = { 1:1, 2:2, 3:2, 4:3, 5:4, 6:5, 7:6, 8:6 };
              return map[currentStep] || 1;
            })()}
            isMobile={isMobile}
            stepLabels={
              isAgeOnly ? ['Start', 'Upload ID', 'Results']
              : isDocumentOnly ? ['Start', 'Front ID', 'Back ID', 'Checking', 'Results']
              : isIdentity ? ['Start', 'Front ID', 'Live Photo', 'Results']
              : undefined
            }
          />
          {renderStepContent()}
        </div>
      </div>
    </div>
  );
};

export { DemoPage };
export default DemoPage;
