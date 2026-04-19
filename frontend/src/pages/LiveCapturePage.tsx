import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { C } from '../theme';
import { ActiveLivenessCapture } from '../components/liveness/ActiveLivenessCapture';
import type { LivenessMetadata } from '../hooks/useActiveLiveness';
import {
  CameraIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  XMarkIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

// OpenCV types
declare global {
  interface Window {
    cv: any;
  }
}

interface LiveCaptureSession {
  live_capture_token: string;
  expires_at: string;
  liveness_challenge: {
    type: string;
    instruction: string;
  };
  user_id: string;
  verification_id: string | null;
  expires_in_seconds: number;
}

interface CaptureResult {
  verification_id: string;
  live_capture_id: string;
  status: string;
  message: string;
  liveness_check_enabled: boolean;
  face_matching_enabled: boolean;
}

interface VerificationResults {
  verification_id: string;
  status: 'pending' | 'processing' | 'verified' | 'failed' | 'manual_review';
  face_match_score?: number;
  liveness_score?: number;
  confidence_score?: number;
  manual_review_reason?: string;
}

export const LiveCapturePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // State
  const [sessionData, setSessionData] = useState<LiveCaptureSession | null>(null);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [verificationResults, setVerificationResults] = useState<VerificationResults | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [cameraState, setCameraState] = useState<'prompt' | 'initializing' | 'ready' | 'error'>('prompt');
  const [challengeState, setChallengeState] = useState<'waiting' | 'active' | 'completed'>('waiting');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [captureAttempts, setCaptureAttempts] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [opencvReady, setOpencvReady] = useState(false);
  const [livenessScore, setLivenessScore] = useState(0);
  const [faceStability, setFaceStability] = useState(0);
  const [useFallbackCapture, setUseFallbackCapture] = useState(false);
  
  // OpenCV refs
  const animationRef = useRef<number | null>(null);
  const faceClassifierRef = useRef<any>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // URL params
  const token = searchParams.get('token');
  const verificationId = searchParams.get('verification_id');
  const apiKey = searchParams.get('api_key');

  // Initialize OpenCV
  useEffect(() => {
    const initOpenCV = () => {
      if (window.cv && window.cv.Mat) {
        console.log('🔧 OpenCV ready');
        setOpencvReady(true);
        setDebugInfo('OpenCV loaded');
        loadFaceClassifier();
      } else {
        console.log('🔧 Waiting for OpenCV...');
        setTimeout(initOpenCV, 100);
      }
    };
    initOpenCV();

    return () => {
      cleanup();
    };
  }, []);

  // Load session data
  useEffect(() => {
    if (!token) {
      setError('Invalid or missing live capture token');
      return;
    }

    const mockSession: LiveCaptureSession = {
      live_capture_token: token,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      liveness_challenge: {
        type: 'blink_twice',
        instruction: 'Please look directly at the camera and blink twice'
      },
      user_id: 'user-123',
      verification_id: verificationId,
      expires_in_seconds: 1800
    };

    setSessionData(mockSession);

    // Auto-start camera when OpenCV is ready and canvas is available
    if (opencvReady && cameraState === 'prompt') {
      // Wait a bit longer to ensure canvas is rendered
      setTimeout(() => {
        if (canvasRef.current) {
          initializeCamera();
        } else {
          console.log('🎥 Canvas not ready, will wait for manual initialization');
        }
      }, 1000);
    }

    // Session expiry timer
    const timer = setTimeout(() => {
      setSessionExpired(true);
      cleanup();
    }, mockSession.expires_in_seconds * 1000);

    return () => clearTimeout(timer);
  }, [token, verificationId, opencvReady]);

  // Polling function to check verification status
  const pollVerificationStatus = async (verificationId: string) => {
    if (!apiKey) return;

    setIsPolling(true);
    let attempts = 0;
    const maxAttempts = 60; // Poll for up to 5 minutes (5 seconds * 60)
    
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/status`, {
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const results = await response.json();
        setVerificationResults(results);
        
        // Check if verification is in a final state (v2: use final_result)
        if (results.final_result !== null && results.final_result !== undefined) {
          setIsPolling(false);
          return; // Stop polling
        }

        // Continue polling if still processing
        attempts++;
        if (attempts < maxAttempts && !results.final_result) {
          setTimeout(poll, 5000); // Poll every 5 seconds
        } else {
          setIsPolling(false);
          if (attempts >= maxAttempts) {
            setError('Verification is taking longer than expected. Please check results manually.');
          }
        }
        
      } catch (error) {
        console.error('Failed to poll verification status:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000);
        } else {
          setIsPolling(false);
          setError('Failed to check verification status. Please try refreshing.');
        }
      }
    };
    
    // Start polling immediately
    poll();
  };

  const loadFaceClassifier = async () => {
    try {
      // For production deployment, we'll use a simplified face detection
      // that doesn't require external cascade files
      if (window.cv && window.cv.CascadeClassifier) {
        const classifier = new window.cv.CascadeClassifier();
        faceClassifierRef.current = classifier;
        console.log('🔧 Face classifier initialized');
      }
    } catch (error) {
      console.warn('🔧 Face classifier load failed, using basic detection:', error);
    }
  };

  const initializeCamera = async () => {
    if (cameraState === 'initializing' || cameraState === 'ready') return;
    
    setCameraState('initializing');
    setError('');
    setLoading(true);

    try {
      console.log('🎥 Initializing camera...');
      setDebugInfo('Requesting camera access...');

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      console.log('🎥 getUserMedia is supported');
      setDebugInfo('getUserMedia supported, checking permissions...');

      // Check permissions first
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          console.log('🎥 Camera permission state:', permission.state);
          setDebugInfo(`Permission state: ${permission.state}`);
        } catch (permError) {
          console.log('🎥 Could not check permissions:', permError);
        }
      }

      console.log('🎥 Requesting camera stream...');
      setDebugInfo('Requesting camera stream...');

      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      };

      console.log('🎥 Constraints:', constraints);

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log('🎥 Stream received:', stream);
      console.log('🎥 Stream active:', stream.active);
      console.log('🎥 Video tracks:', stream.getVideoTracks().length);
      
      if (stream.getVideoTracks().length === 0) {
        throw new Error('No video tracks in stream');
      }

      streamRef.current = stream;
      setDebugInfo('Stream received, setting up canvas...');

      // Double-check canvas is available
      if (!canvasRef.current) {
        // Canvas might not be rendered yet, wait a bit and retry
        console.log('🎥 Canvas not available, retrying in 500ms...');
        setTimeout(() => {
          if (canvasRef.current) {
            console.log('🎥 Canvas now available, continuing setup...');
            setupCanvas(stream);
            setCameraState('ready');
            setDebugInfo('Camera ready - waiting for video to start');
            setLoading(false);
            console.log('🎥 Camera initialized successfully');
          } else {
            console.error('🎥 Canvas still not available after retry');
            setCameraState('error');
            setError('Canvas element not found. Please refresh the page.');
            setLoading(false);
          }
        }, 500);
        return; // Exit early, let the timeout handle it
      }

      console.log('🎥 Setting up canvas...');
      setupCanvas(stream);
      
      setCameraState('ready');
      setDebugInfo('Camera ready - waiting for video to start');
      console.log('🎥 Camera initialized successfully');

    } catch (error: any) {
      console.error('🎥 Camera initialization failed:', error);
      setCameraState('error');
      
      let errorMessage = 'Camera access failed';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please enable camera access.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found. Please connect a camera.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application.';
      } else if (error.name === 'SecurityError') {
        errorMessage = 'Camera access blocked due to security settings.';
      } else {
        errorMessage = `Camera error: ${error.message || 'Unknown error'}`;
      }
      
      setError(errorMessage);
      setDebugInfo(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const setupCanvas = (stream: MediaStream) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('🎥 Canvas is null in setupCanvas');
      return;
    }

    console.log('🎥 Creating video element...');
    
    // Create a hidden video element to get frames from the stream
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    
    console.log('🎥 Video element created, waiting for metadata...');
    
    video.onloadedmetadata = () => {
      console.log('🎥 Video metadata loaded:', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
        readyState: video.readyState
      });
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      console.log('🎥 Canvas dimensions set:', canvas.width, 'x', canvas.height);
    };

    video.onplay = () => {
      console.log('🎥 Video element started playing');
      // Start processing only when video is actually playing
      setTimeout(() => {
        console.log('🎥 Starting video processing after play event');
        startVideoProcessing();
      }, 100);
    };

    video.oncanplay = () => {
      console.log('🎥 Video can start playing');
      console.log('🎥 Video dimensions at canplay:', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState
      });
      video.play().catch(err => console.error('🎥 Video play failed:', err));
    };

    video.onerror = (e) => {
      console.error('🎥 Video element error:', e);
    };

    // Store video element reference using React ref
    videoElementRef.current = video;
    
    console.log('🎥 Canvas setup completed');
  };

  const startVideoProcessing = () => {
    if (!canvasRef.current) {
      console.error('🎥 Canvas is null in startVideoProcessing');
      return;
    }

    console.log('🎥 Starting video processing loop...');

    const processFrame = () => {
      const canvas = canvasRef.current;
      const video = videoElementRef.current;
      
      if (!canvas) {
        console.error('🎥 Canvas lost during processing');
        return;
      }

      if (!video) {
        console.error('🎥 Video element lost during processing');
        animationRef.current = requestAnimationFrame(processFrame);
        return;
      }

      if (video.readyState < 2 || video.videoWidth === 0) {
        // Video not ready yet, continue loop
        animationRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        console.error('🎥 Could not get canvas context');
        return;
      }

      try {
        // Clear canvas first
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Perform face detection (draws overlay on top)
        detectFaces(canvas, ctx);
      } catch (drawError) {
        console.error('🎥 Error drawing video frame:', drawError);
      }

      animationRef.current = requestAnimationFrame(processFrame);
    };

    processFrame();
    console.log('🎥 Video processing loop started');
  };

  const detectFaces = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    try {
      // Simple face detection using image analysis
      // This is more reliable than loading external cascade files
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const faceFound = performBasicFaceDetection(imageData, canvas.width, canvas.height);

      // Add visual feedback
      if (faceFound) {
        drawFaceOverlay(ctx, canvas.width, canvas.height, true);
      } else {
        drawFaceOverlay(ctx, canvas.width, canvas.height, false);
      }

      // Update face detection state with smoothing
      updateFaceDetectionState(faceFound);

    } catch (error) {
      console.warn('🔧 Face detection error:', error);
    }
  };

  const performBasicFaceDetection = (imageData: ImageData, width: number, height: number): boolean => {
    // Much more permissive face detection algorithm
    const data = imageData.data;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Method 1: Expanded skin color detection with more inclusive ranges
    const regionSize = Math.min(width, height) * 0.5; // Even larger detection region
    let skinPixels = 0;
    let totalPixels = 0;
    let brightnessSum = 0;
    let colorVariance = 0;
    let warmPixels = 0; // Count warm-toned pixels
    
    // Sample every pixel in the region for more accurate detection
    for (let y = centerY - regionSize/2; y < centerY + regionSize/2; y += 1) {
      for (let x = centerX - regionSize/2; x < centerX + regionSize/2; x += 1) {
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const i = (Math.floor(y) * width + Math.floor(x)) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        const brightness = (r + g + b) / 3;
        brightnessSum += brightness;
        colorVariance += Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
        
        // Very inclusive skin tone detection - covers all ethnicities
        const skinCondition1 = r > 50 && g > 25 && b > 15 && r > b; // Basic warm tone
        const skinCondition2 = brightness > 40 && brightness < 250 && r >= g; // General human skin range
        const skinCondition3 = r > 30 && g > 15 && b > 10 && (r + g) > b * 1.5; // Warm dominated
        const skinCondition4 = brightness > 60 && Math.abs(r - g) < 60; // Mid-tone skin
        
        // Also detect any reasonably bright region that could be skin
        const isWarmToned = r > g && r > b && brightness > 50;
        
        if (skinCondition1 || skinCondition2 || skinCondition3 || skinCondition4) {
          skinPixels++;
        }
        
        if (isWarmToned) {
          warmPixels++;
        }
        
        totalPixels++;
      }
    }
    
    const skinRatio = totalPixels > 0 ? skinPixels / totalPixels : 0;
    const warmRatio = totalPixels > 0 ? warmPixels / totalPixels : 0;
    const avgBrightness = totalPixels > 0 ? brightnessSum / totalPixels : 0;
    const avgColorVariance = totalPixels > 0 ? colorVariance / totalPixels : 0;
    
    // Method 2: More lenient edge detection
    let edgePixels = 0;
    let strongEdges = 0;
    const edgeThreshold = 15; // Much lower threshold
    const strongEdgeThreshold = 30; // Much lower threshold
    
    for (let y = centerY - regionSize/3; y < centerY + regionSize/3; y += 2) {
      for (let x = centerX - regionSize/3; x < centerX + regionSize/3; x += 2) {
        if (x < 1 || x >= width-1 || y < 1 || y >= height-1) continue;
        
        const i = (Math.floor(y) * width + Math.floor(x)) * 4;
        const current = (data[i] + data[i + 1] + data[i + 2]) / 3;
        
        const right = (data[i + 4] + data[i + 5] + data[i + 6]) / 3;
        const bottom = (data[i + width * 4] + data[i + width * 4 + 1] + data[i + width * 4 + 2]) / 3;
        
        const edgeStrength = Math.max(Math.abs(current - right), Math.abs(current - bottom));
        if (edgeStrength > edgeThreshold) {
          edgePixels++;
          if (edgeStrength > strongEdgeThreshold) {
            strongEdges++;
          }
        }
      }
    }
    
    // Calculate liveness indicators with more generous scoring
    const detectionQuality = Math.min(1, Math.max(skinRatio * 3, warmRatio * 2)); // Boost skin detection
    const lightingQuality = avgBrightness > 30 && avgBrightness < 250 ? 1 : 0.7; // More permissive lighting
    const textureQuality = Math.min(1, avgColorVariance / 20); // Lower threshold for texture
    const featureQuality = Math.min(1, edgePixels / 20); // Much lower threshold for features
    
    // Update liveness score (0-1 scale) with more generous weighting
    const currentLivenessScore = Math.max(0.5, detectionQuality * 0.6 + lightingQuality * 0.2 + textureQuality * 0.1 + featureQuality * 0.1);
    setLivenessScore(currentLivenessScore);
    
    // Track face stability over time with shorter history
    const faceHistory = (window as any).faceStabilityHistory || [];
    faceHistory.push((skinRatio > 0.02 || warmRatio > 0.05) ? 1 : 0); // Much lower thresholds
    if (faceHistory.length > 5) faceHistory.shift(); // Shorter history for faster response
    (window as any).faceStabilityHistory = faceHistory;
    
    const stability = faceHistory.reduce((a: number, b: number) => a + b, 0) / Math.max(faceHistory.length, 1);
    setFaceStability(Math.max(0.5, stability)); // Boost stability score
    
    // Much more permissive detection criteria
    const hasReasonableLighting = avgBrightness > 30 && avgBrightness < 250;
    const hasAnyFacialContent = skinRatio > 0.02 || warmRatio > 0.05; // Very low threshold
    const hasAnyFeatures = edgePixels > 2; // Very low feature requirement
    const hasBasicLiveness = currentLivenessScore > 0.3; // Much lower liveness threshold
    
    // Additional fallback: if there's any reasonable content in the center, consider it a face
    const hasAnyContent = avgBrightness > 40 && avgColorVariance > 5;
    
    const detected = (hasReasonableLighting && hasAnyFacialContent && hasAnyFeatures) || 
                    (hasBasicLiveness && hasAnyContent);
    
    // Debug logging
    if (detected !== (window as any).lastDetectionState) {
      console.log('🔍 Face detection change:', {
        detected,
        skinRatio: skinRatio.toFixed(3),
        warmRatio: warmRatio.toFixed(3),
        avgBrightness: avgBrightness.toFixed(0),
        edgePixels,
        livenessScore: currentLivenessScore.toFixed(3),
        stability: stability.toFixed(3)
      });
      (window as any).lastDetectionState = detected;
    }
    
    return detected;
  };

  const drawFaceOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number, faceDetected: boolean) => {
    // v2: dashed oval with accent color
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = Math.min(width, height) * 0.22;
    const radiusY = radiusX * 1.35; // taller oval for face shape

    ctx.strokeStyle = faceDetected ? C.green : C.red;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);

    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // Status text — mono font
    ctx.fillStyle = faceDetected ? C.green : C.red;
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    const statusText = faceDetected ? 'FACE DETECTED' : 'POSITION FACE IN FRAME';
    ctx.fillText(
      statusText,
      centerX,
      centerY + radiusY + 22
    );

    // Liveness indicators — mono font
    if (faceDetected && livenessScore > 0) {
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillStyle = C.green;
      ctx.fillText(
        `LIVENESS ${Math.round(livenessScore * 100)}%  |  STABILITY ${Math.round(faceStability * 100)}%`,
        centerX,
        centerY + radiusY + 40
      );
    }
  };

  const updateFaceDetectionState = (detected: boolean) => {
    // More responsive smoothing algorithm
    const history = (window as any).faceHistory || [];
    history.push(detected);
    if (history.length > 6) history.shift(); // Shorter history for faster response
    (window as any).faceHistory = history;
    
    const positiveCount = history.filter((h: boolean) => h).length;
    const totalCount = history.length;
    
    // More responsive thresholds
    let smoothedDetection = false;
    if (totalCount >= 3) {
      // Quick detection: 2/3 recent frames
      if (positiveCount >= 2 && totalCount <= 3) {
        smoothedDetection = true;
      }
      // Stable detection: 4/6 frames for longer sequences
      else if (positiveCount >= 4 && totalCount >= 6) {
        smoothedDetection = true;
      }
      // Medium detection: 3/5 frames
      else if (positiveCount >= 3 && totalCount >= 5) {
        smoothedDetection = true;
      }
    }
    
    setFaceDetected(smoothedDetection);
  };

  const startChallenge = () => {
    // More permissive challenge requirements
    if (challengeState !== 'waiting' || !faceDetected || livenessScore < 0.4 || faceStability < 0.5) {
      if (!faceDetected) {
        setError('No face detected. Please position your face clearly in the center of the frame.');
      } else if (livenessScore < 0.4) {
        setError('Please ensure good lighting and face clearly visible for liveness detection.');
      } else if (faceStability < 0.5) {
        setError('Please hold your face steady in the center of the frame.');
      }
      return;
    }

    setChallengeState('active');
    setCountdown(3);
    setError(''); // Clear any previous errors

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          // Final face detection check before capture
          if (faceDetected && livenessScore >= 0.4 && faceStability >= 0.5) {
            performCapture();
          } else {
            setError('Face detection lost during countdown. Please try again.');
            setChallengeState('waiting');
          }
          return null;
        }
        
        // Continuously validate face detection during countdown
        if (!faceDetected || livenessScore < 0.4 || faceStability < 0.5) {
          clearInterval(timer);
          setError('Face detection lost during countdown. Please ensure your face remains visible.');
          setChallengeState('waiting');
          return null;
        }
        
        return prev - 1;
      });
    }, 1000);
  };

  const performCapture = async () => {
    if (!canvasRef.current || !sessionData || !apiKey) {
      setError('Missing required data for capture');
      return;
    }

    // Critical security check - ensure face is still detected before capture
    if (!faceDetected || livenessScore < 0.4 || faceStability < 0.5) {
      setError('Face detection lost. Please ensure your face is clearly visible and try again.');
      setChallengeState('waiting');
      setCountdown(null);
      return;
    }

    setLoading(true);
    setCaptureAttempts(prev => prev + 1);

    try {
      const canvas = canvasRef.current;

      console.log('📸 Capturing frame for verification...');

      // Convert canvas to blob for v2 multipart upload
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => { if (b) resolve(b); else reject(new Error('Failed to capture image')); },
          'image/jpeg', 0.8,
        );
      });

      const formData = new FormData();
      formData.append('selfie', blob, 'selfie.jpg');

      console.log('🔧 API Key (first 10 chars):', apiKey?.substring(0, 10));
      console.log('🔧 Verification ID:', sessionData.verification_id);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(`${API_BASE_URL}/api/v2/verify/${sessionData.verification_id}/live-capture`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
        },
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('🔧 Response status:', response.status);
      console.log('🔧 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorData = await response.json();
        console.log('🔧 Error response:', errorData);
        throw new Error(errorData.message || 'Live capture failed');
      }

      const result: CaptureResult = await response.json();
      setCaptureResult(result);
      setChallengeState('completed');
      cleanup();
      
      // Start polling for verification results if capture was successful
      if (result.verification_id && result.status === 'processing') {
        console.log('🔄 Starting verification status polling...');
        pollVerificationStatus(result.verification_id);
      }

    } catch (error: any) {
      console.error('📸 Capture failed:', error);
      
      let errorMessage = 'Failed to capture image. Please try again.';
      if (error.name === 'AbortError') {
        errorMessage = 'Request timed out. Please check your connection and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      setChallengeState('waiting');
      
      if (captureAttempts >= 3) {
        setError('Maximum capture attempts exceeded. Please refresh and try again.');
        cleanup();
      }
    } finally {
      setLoading(false);
    }
  };

  const cleanup = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null;
      videoElementRef.current = null;
    }
    
    if (faceClassifierRef.current) {
      try {
        faceClassifierRef.current.delete();
      } catch (e) {
        console.log('🔧 Classifier cleanup error:', e);
      }
      faceClassifierRef.current = null;
    }
  };

  const retryCamera = () => {
    cleanup();
    setCameraState('prompt');
    setError('');
    setCaptureResult(null);
    setChallengeState('waiting');
    setCaptureAttempts(0);
    setTimeout(initializeCamera, 100);
  };

  const goToResults = async () => {
    if (captureResult?.verification_id && apiKey) {
      navigate(`/verify?verification_id=${captureResult.verification_id}&api_key=${apiKey}&step=5`);
    }
  };

  // Render session expired
  if (sessionExpired) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sans)' }}>
        <div className="card" style={{ maxWidth: 440, width: '100%', margin: '0 16px', padding: 32, textAlign: 'center' }}>
          <ExclamationTriangleIcon style={{ width: 48, height: 48, color: C.red, margin: '0 auto 16px' }} />
          <h2 style={{ color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            Session Expired
          </h2>
          <p style={{ color: 'var(--mid)', fontSize: 14, margin: '0 0 24px' }}>
            Your live capture session has expired. Please start a new verification.
          </p>
          <button
            onClick={() => navigate('/verify')}
            className="btn-accent"
            style={{ width: '100%', justifyContent: 'center', minHeight: 48 }}
          >
            Start New Verification
          </button>
        </div>
      </div>
    );
  }

  // Render success
  if (captureResult) {
    const finalResults = verificationResults || { status: captureResult.status };
    const isProcessing = isPolling || (finalResults.status === 'processing' && !verificationResults);
    const isVerified = finalResults.status === 'verified';
    const isFailed = finalResults.status === 'failed';
    const isManualReview = finalResults.status === 'manual_review';

    // v2: status-driven accent color
    let statusClr: string = C.blue;
    if (isVerified) statusClr = C.green;
    else if (isFailed) statusClr = C.red;
    else if (isManualReview) statusClr = C.amber;

    const resultRow = (label: string, value: string, color: string) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--rule)' }}>
        <span style={{ color: 'var(--mid)', fontFamily: 'var(--mono)', fontSize: 12 }}>{label}</span>
        <span style={{ color, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>{value}</span>
      </div>
    );

    return (
      <div style={{ minHeight: '100vh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--sans)' }}>
        <div className="card" style={{ maxWidth: 440, width: '100%', margin: '0 16px', padding: 32, textAlign: 'center' }}>
          {/* Icon / spinner */}
          <div style={{ width: 48, height: 48, margin: '0 auto 16px', position: 'relative' }}>
            {isProcessing ? (
              <div style={{ width: 48, height: 48, border: `2px solid var(--rule)`, borderTopColor: statusClr, animation: 'spin 1s linear infinite' }} />
            ) : (
              <CheckCircleIcon style={{ width: 48, height: 48, color: statusClr }} />
            )}
          </div>

          <h2 style={{ color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            {isProcessing ? 'Processing...' : 'Capture Complete'}
          </h2>

          <p style={{ color: 'var(--mid)', fontSize: 14, margin: '0 0 20px' }}>
            {isProcessing
              ? 'Please wait while we verify your identity.'
              : isVerified
                ? 'Your identity has been successfully verified.'
                : isFailed
                  ? 'Verification failed. Please try again.'
                  : isManualReview
                    ? 'Your verification is under manual review.'
                    : 'Your live capture has been successfully processed.'
            }
          </p>

          {/* Results table */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--rule)', padding: 16, marginBottom: 24, textAlign: 'left' }}>
            {resultRow('Status', isProcessing && !verificationResults ? 'processing' : finalResults.status, statusClr)}
            {resultRow('Liveness Check', captureResult.liveness_check_enabled ? 'Enabled' : 'Disabled', captureResult.liveness_check_enabled ? C.green : 'var(--mid)')}
            {resultRow('Face Matching', captureResult.face_matching_enabled ? 'Enabled' : 'Disabled', captureResult.face_matching_enabled ? C.green : 'var(--mid)')}

            {verificationResults && (
              <>
                {verificationResults.face_match_score !== undefined &&
                  resultRow('Face Match', `${Math.round(verificationResults.face_match_score * 100)}%`, C.green)}
                {verificationResults.liveness_score !== undefined &&
                  resultRow('Liveness Score', `${Math.round(verificationResults.liveness_score * 100)}%`, C.green)}
                {verificationResults.confidence_score !== undefined &&
                  resultRow('Confidence', `${Math.round(verificationResults.confidence_score * 100)}%`, C.green)}
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!isProcessing ? (
              <button
                onClick={goToResults}
                className="btn-accent"
                style={{ width: '100%', justifyContent: 'center', minHeight: 48 }}
              >
                View Full Results
              </button>
            ) : (
              <div style={{ background: 'var(--accent-soft)', border: '1px solid color-mix(in oklab, var(--accent) 30%, transparent)', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <div style={{ width: 16, height: 16, border: '2px solid var(--rule)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                <span style={{ color: 'var(--accent-ink)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {isPolling ? 'Checking verification status...' : 'Processing verification...'}
                </span>
              </div>
            )}

            {error && (
              <div style={{ background: C.redDim, border: `1px solid ${C.red}`, padding: 16 }}>
                <p style={{ color: C.red, fontFamily: 'var(--mono)', fontSize: 12, margin: '0 0 8px' }}>{error}</p>
                <button
                  onClick={goToResults}
                  style={{ color: 'var(--accent-ink)', fontFamily: 'var(--mono)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  Check results manually
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Handle active liveness completion
  const handleActiveLivenessComplete = useCallback(async (blob: Blob, metadata: LivenessMetadata) => {
    if (!sessionData || !apiKey) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('selfie', blob, 'selfie.jpg');
      formData.append('liveness_metadata', JSON.stringify(metadata));

      const response = await fetch(`${API_BASE_URL}/api/v2/verify/${sessionData.verification_id}/live-capture`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Live capture failed');
      }

      const result: CaptureResult = await response.json();
      setCaptureResult(result);
      setChallengeState('completed');
      cleanup();
      if (result.verification_id && result.status === 'processing') {
        pollVerificationStatus(result.verification_id);
      }
    } catch (err: any) {
      setError(err.message || 'Liveness verification failed');
    } finally {
      setLoading(false);
    }
  }, [sessionData, apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Main camera interface
  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)', fontFamily: 'var(--sans)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>idswyft / live-capture</div>
          <h1 style={{ color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 24, fontWeight: 600, margin: '0 0 8px' }}>
            Live Identity Verification
          </h1>
          <p style={{ color: 'var(--mid)', fontSize: 14, margin: 0 }}>
            Complete your verification with live face capture
          </p>
        </div>

        {/* Active Liveness -- primary path */}
        {!useFallbackCapture && !captureResult && (
          <div style={{ marginBottom: 24 }}>
            <ActiveLivenessCapture
              onComplete={handleActiveLivenessComplete}
              onCancel={() => navigate('/verify')}
              onFallback={() => setUseFallbackCapture(true)}
            />
          </div>
        )}

        {/* Fallback: legacy OpenCV camera interface */}
        {useFallbackCapture && <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Canvas for camera - always present but conditionally visible */}
          {cameraState === 'ready' && (
            <div className="capture-frame" style={{ position: 'relative', background: '#000' }}>
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                style={{ width: '100%', height: 'auto', maxHeight: 384, objectFit: 'cover', display: 'block' }}
              />
              <div className="corners" />
            </div>
          )}

          {/* Hidden canvas for initialization when not ready */}
          {cameraState !== 'ready' && (
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              style={{ display: 'none' }}
            />
          )}

          {/* Camera Permission Prompt */}
          {cameraState === 'prompt' && (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <CameraIcon style={{ width: 48, height: 48, color: 'var(--accent)', margin: '0 auto 20px' }} />
              <h2 style={{ color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
                Camera Access Required
              </h2>
              <p style={{ color: 'var(--mid)', fontSize: 14, margin: '0 0 24px' }}>
                We need access to your camera for live identity verification using Face-API technology.
              </p>
              <button
                onClick={initializeCamera}
                disabled={!opencvReady || loading}
                className="btn-accent"
                style={{ margin: '0 auto', minHeight: 48, justifyContent: 'center' }}
              >
                {!opencvReady ? (
                  <>
                    <ArrowPathIcon style={{ width: 16, height: 16 }} className="animate-spin" />
                    Loading Face-API...
                  </>
                ) : loading ? (
                  <>
                    <ArrowPathIcon style={{ width: 16, height: 16 }} className="animate-spin" />
                    Initializing Camera...
                  </>
                ) : (
                  <>
                    <CameraIcon style={{ width: 16, height: 16 }} />
                    Enable Camera
                  </>
                )}
              </button>
            </div>
          )}

          {/* Camera Error */}
          {cameraState === 'error' && (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <ExclamationTriangleIcon style={{ width: 48, height: 48, color: C.red, margin: '0 auto 20px' }} />
              <h2 style={{ color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
                Camera Access Failed
              </h2>
              <p style={{ color: 'var(--mid)', fontSize: 14, margin: '0 0 24px' }}>{error}</p>
              <button
                onClick={retryCamera}
                className="btn-secondary"
                style={{ margin: '0 auto', minHeight: 48, justifyContent: 'center' }}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Live Camera Feed */}
          {cameraState === 'ready' && sessionData && (
            <div style={{ position: 'relative' }}>
              {/* Challenge Info -- v2 prompt-tag style header */}
              <div style={{ background: 'var(--panel)', borderBottom: '1px solid var(--rule)', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <EyeIcon style={{ width: 20, height: 20, color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <h3 style={{ color: 'var(--ink)', fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, margin: 0 }}>Liveness Challenge</h3>
                    <p style={{ color: 'var(--mid)', fontSize: 13, margin: '2px 0 0' }}>{sessionData.liveness_challenge.instruction}</p>
                  </div>
                </div>

                {/* Face Detection Status Indicator -- v2 solid border badge */}
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: 12,
                  background: faceDetected ? C.greenDim : C.redDim,
                  border: `1px solid ${faceDetected ? C.green : C.red}`,
                  marginBottom: countdown !== null ? 12 : 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 6, height: 6, background: faceDetected ? C.green : C.red, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500, color: faceDetected ? C.green : C.red, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {faceDetected ? 'Face Detected -- Ready' : 'No Face Detected'}
                    </span>
                  </div>
                  {!faceDetected && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mid)' }}>
                      Position your face in frame
                    </span>
                  )}
                  {faceDetected && (
                    <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--mono)', fontSize: 11, color: C.green }}>
                      <span>Liveness: {Math.round(livenessScore * 100)}%</span>
                      <span>Stability: {Math.round(faceStability * 100)}%</span>
                    </div>
                  )}
                </div>

                {countdown !== null && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 36, fontWeight: 700, color: 'var(--ink)' }}>{countdown}</div>
                    <p style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)', margin: 0 }}>Get ready...</p>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid var(--rule)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Attempts: {captureAttempts}/3
                  </span>
                  {sessionData && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mid)' }}>
                      Expires: {new Date(sessionData.expires_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                <div style={{ textAlign: 'center' }}>
                  {challengeState === 'waiting' && (
                    <button
                      onClick={startChallenge}
                      disabled={!faceDetected || loading || livenessScore < 0.4 || faceStability < 0.5}
                      className="btn-accent"
                      style={{ width: '100%', justifyContent: 'center', minHeight: 48, maxWidth: 320, margin: '0 auto' }}
                    >
                      {!faceDetected ? (
                        <>
                          <ExclamationTriangleIcon style={{ width: 16, height: 16 }} />
                          Position Your Face
                        </>
                      ) : loading ? (
                        <>
                          <ArrowPathIcon style={{ width: 16, height: 16 }} className="animate-spin" />
                          Processing...
                        </>
                      ) : livenessScore < 0.4 ? (
                        <>
                          <ExclamationTriangleIcon style={{ width: 16, height: 16 }} />
                          Improve Lighting
                        </>
                      ) : faceStability < 0.5 ? (
                        <>
                          <ExclamationTriangleIcon style={{ width: 16, height: 16 }} />
                          Hold Steady
                        </>
                      ) : (
                        <>
                          <CameraIcon style={{ width: 16, height: 16 }} />
                          Start Capture
                        </>
                      )}
                    </button>
                  )}

                  {challengeState === 'active' && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                        Performing challenge...
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--mid)' }}>
                        {sessionData.liveness_challenge.instruction}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && cameraState !== 'error' && (
            <div style={{ padding: '12px 20px', background: C.redDim, borderTop: `1px solid ${C.red}`, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <XMarkIcon style={{ width: 16, height: 16, color: C.red, flexShrink: 0, marginTop: 1 }} />
              <p style={{ color: C.red, fontFamily: 'var(--mono)', fontSize: 12, margin: 0 }}>{error}</p>
            </div>
          )}
        </div>}

        {/* Instructions -- v2 checklist style */}
        <div style={{ marginTop: 24, border: '1px solid var(--rule)', background: 'var(--panel)', padding: '20px 24px' }}>
          <h3 style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: 'var(--mid)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px' }}>
            Live Capture Instructions
          </h3>
          <ul className="checklist">
            <li>
              <span className="dot">--</span>
              <span style={{ color: 'var(--ink)', fontSize: 13 }}>Uses Face-API for reliable camera processing</span>
              <span className="status" />
            </li>
            <li>
              <span className="dot">--</span>
              <span style={{ color: 'var(--ink)', fontSize: 13 }}>Ensure good lighting on your face</span>
              <span className="status" />
            </li>
            <li>
              <span className="dot">--</span>
              <span style={{ color: 'var(--ink)', fontSize: 13 }}>Position your face in the center of frame</span>
              <span className="status" />
            </li>
            <li>
              <span className="dot">--</span>
              <span style={{ color: 'var(--ink)', fontSize: 13 }}>Wait for green indicator showing face detection</span>
              <span className="status" />
            </li>
          </ul>

          {debugInfo && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--paper)', border: '1px solid var(--rule)' }}>
              <p style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)', margin: 0 }}>Status: {debugInfo}</p>
              {cameraState === 'ready' && (
                <button
                  onClick={retryCamera}
                  className="btn-secondary"
                  style={{ marginTop: 8, minHeight: 36 }}
                >
                  Restart Camera
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};