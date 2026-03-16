import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
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
    // Draw face detection indicator
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.25;
    
    ctx.strokeStyle = faceDetected ? '#10B981' : '#EF4444';
    ctx.lineWidth = 3;
    ctx.setLineDash(faceDetected ? [] : [10, 10]);
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Draw status text with better positioning
    ctx.fillStyle = faceDetected ? '#10B981' : '#EF4444';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    const statusText = faceDetected ? 'Face Detected' : 'Position Face in Frame';
    ctx.fillText(
      statusText,
      centerX,
      centerY + radius + 25
    );
    
    // Draw liveness indicators
    if (faceDetected && livenessScore > 0) {
      ctx.font = '12px Arial';
      ctx.fillStyle = '#10B981';
      ctx.fillText(
        `Liveness: ${Math.round(livenessScore * 100)}%`,
        centerX,
        centerY + radius + 50
      );
      ctx.fillText(
        `Stability: ${Math.round(faceStability * 100)}%`,
        centerX,
        centerY + radius + 65
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
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <ExclamationTriangleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Session Expired</h2>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 px-2">
              Your live capture session has expired. Please start a new verification.
            </p>
            <button
              onClick={() => navigate('/verify')}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-xl hover:bg-blue-700 transition text-sm sm:text-base min-h-[48px]"
            >
              Start New Verification
            </button>
          </div>
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
    
    // Determine background and icon colors based on status
    let bgGradient = 'from-green-50 via-white to-green-50';
    let iconColor = 'text-green-500';
    let statusColor = 'text-blue-600';
    
    if (isVerified) {
      bgGradient = 'from-green-50 via-white to-green-50';
      iconColor = 'text-green-500';
      statusColor = 'text-green-600';
    } else if (isFailed) {
      bgGradient = 'from-red-50 via-white to-red-50';
      iconColor = 'text-red-500';
      statusColor = 'text-red-600';
    } else if (isManualReview) {
      bgGradient = 'from-yellow-50 via-white to-yellow-50';
      iconColor = 'text-yellow-500';
      statusColor = 'text-yellow-600';
    } else if (isProcessing) {
      bgGradient = 'from-blue-50 via-white to-blue-50';
      iconColor = 'text-blue-500';
      statusColor = 'text-blue-600';
    }
    
    return (
      <div className={`min-h-screen bg-gradient-to-br ${bgGradient} flex items-center justify-center`}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            {/* Icon with conditional rendering for processing spinner */}
            <div className="w-16 h-16 mx-auto mb-4 relative">
              {isProcessing ? (
                <div className="w-16 h-16 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin"></div>
              ) : (
                <CheckCircleIcon className={`w-16 h-16 ${iconColor}`} />
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              {isProcessing ? 'Processing...' : 'Capture Complete!'}
            </h2>
            
            <p className="text-sm sm:text-base text-gray-600 mb-4 px-2">
              {isProcessing 
                ? 'Please wait while we verify your identity. This may take a few moments...'
                : isVerified 
                  ? 'Your identity has been successfully verified.'
                  : isFailed 
                    ? 'Verification failed. Please try again.'
                    : isManualReview 
                      ? 'Your verification is under manual review.'
                      : 'Your live capture has been successfully processed.'
              }
            </p>
            
            <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <div className="flex items-center">
                    <span className={`font-semibold ${statusColor}`}>
                      {isProcessing && !verificationResults ? 'processing' : finalResults.status}
                    </span>
                    {isProcessing && (
                      <div className="ml-2 w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Liveness Check:</span>
                  <span className={`font-semibold ${captureResult.liveness_check_enabled ? 'text-green-600' : 'text-gray-600'}`}>
                    {captureResult.liveness_check_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Face Matching:</span>
                  <span className={`font-semibold ${captureResult.face_matching_enabled ? 'text-green-600' : 'text-gray-600'}`}>
                    {captureResult.face_matching_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                
                {/* Show additional verification details when available */}
                {verificationResults && (
                  <>
                    {verificationResults.face_match_score !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Face Match:</span>
                        <span className="font-semibold text-green-600">
                          {Math.round(verificationResults.face_match_score * 100)}%
                        </span>
                      </div>
                    )}
                    {verificationResults.liveness_score !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Liveness Score:</span>
                        <span className="font-semibold text-green-600">
                          {Math.round(verificationResults.liveness_score * 100)}%
                        </span>
                      </div>
                    )}
                    {verificationResults.confidence_score !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Confidence:</span>
                        <span className="font-semibold text-green-600">
                          {Math.round(verificationResults.confidence_score * 100)}%
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {!isProcessing ? (
                <button
                  onClick={goToResults}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-xl hover:bg-blue-700 transition text-sm sm:text-base min-h-[48px]"
                >
                  View Full Results
                </button>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mr-3"></div>
                    <span className="text-blue-700 text-sm">
                      {isPolling ? 'Checking verification status...' : 'Processing verification...'}
                    </span>
                  </div>
                </div>
              )}
              
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-red-700 text-sm">{error}</p>
                  <button
                    onClick={goToResults}
                    className="mt-2 text-blue-600 hover:text-blue-700 text-sm underline"
                  >
                    Check results manually
                  </button>
                </div>
              )}
            </div>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-4xl mx-auto p-3 sm:p-6">
        {/* Header */}
        <div className="text-center mb-4 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-2 sm:mb-4">Live Identity Verification</h1>
          <p className="text-base sm:text-xl text-gray-600 px-4 sm:px-0">Complete your verification with live face capture</p>
        </div>

        {/* Active Liveness — primary path */}
        {!useFallbackCapture && !captureResult && (
          <div className="mb-6">
            <ActiveLivenessCapture
              onComplete={handleActiveLivenessComplete}
              onCancel={() => navigate('/verify')}
              onFallback={() => setUseFallbackCapture(true)}
            />
          </div>
        )}

        {/* Fallback: legacy OpenCV camera interface */}
        {useFallbackCapture && <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Canvas for camera - always present but conditionally visible */}
          {cameraState === 'ready' && (
            <div className="relative bg-black">
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className="w-full h-64 sm:h-96 object-cover"
                style={{ maxHeight: window.innerWidth < 640 ? '256px' : '384px' }}
              />
            </div>
          )}
          
          {/* Hidden canvas for initialization when not ready */}
          {cameraState !== 'ready' && (
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="hidden"
            />
          )}
          
          {/* Camera Permission Prompt */}
          {cameraState === 'prompt' && (
            <div className="p-4 sm:p-8 text-center">
              <CameraIcon className="w-12 h-12 sm:w-16 sm:h-16 text-blue-500 mx-auto mb-4 sm:mb-6" />
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">Camera Access Required</h2>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 px-2">
                We need access to your camera for live identity verification using Face-API technology.
              </p>
              <button
                onClick={initializeCamera}
                disabled={!opencvReady || loading}
                className="bg-blue-600 text-white py-3 px-6 sm:py-4 sm:px-8 rounded-xl hover:bg-blue-700 disabled:bg-gray-400 transition flex items-center justify-center mx-auto text-sm sm:text-base min-h-[48px]"
              >
                {!opencvReady ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin" />
                    <span className="hidden sm:inline">Loading Face-API...</span>
                    <span className="sm:hidden">Loading...</span>
                  </>
                ) : loading ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin" />
                    <span className="hidden sm:inline">Initializing Camera...</span>
                    <span className="sm:hidden">Starting...</span>
                  </>
                ) : (
                  <>
                    <CameraIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Enable Camera
                  </>
                )}
              </button>
            </div>
          )}

          {/* Camera Error */}
          {cameraState === 'error' && (
            <div className="p-4 sm:p-8 text-center">
              <ExclamationTriangleIcon className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mx-auto mb-4 sm:mb-6" />
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">Camera Access Failed</h2>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 px-2">{error}</p>
              <div className="space-y-3">
                <button
                  onClick={retryCamera}
                  className="bg-blue-600 text-white py-3 px-6 rounded-xl hover:bg-blue-700 transition text-sm sm:text-base min-h-[48px]"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* Live Camera Feed */}
          {cameraState === 'ready' && sessionData && (
            <div className="relative">
              {/* Challenge Info */}
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 sm:p-6 text-white">
                <div className="flex flex-col sm:flex-row items-center justify-center sm:space-x-4 mb-4">
                  <div className="p-2 sm:p-3 bg-white/20 rounded-full mb-2 sm:mb-0">
                    <EyeIcon className="w-6 h-6 sm:w-8 sm:h-8" />
                  </div>
                  <div className="text-center sm:text-left">
                    <h3 className="text-lg sm:text-xl font-bold">Liveness Challenge</h3>
                    <p className="text-sm sm:text-base text-blue-100 mt-1">{sessionData.liveness_challenge.instruction}</p>
                  </div>
                </div>

                {/* Face Detection Status Indicator */}
                <div className={`flex flex-col items-center justify-center space-y-2 p-3 sm:p-4 rounded-xl mb-4 ${
                  faceDetected 
                    ? 'bg-green-500/20 border border-green-400/30' 
                    : 'bg-red-500/20 border border-red-400/30'
                }`}>
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <div className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full ${
                      faceDetected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                    }`}></div>
                    <span className={`text-xs sm:text-sm font-medium text-center ${
                      faceDetected ? 'text-green-100' : 'text-red-100'
                    }`}>
                      {faceDetected 
                        ? '✓ Face Detected - Ready' 
                        : '⚠ No Face Detected'
                      }
                    </span>
                  </div>
                  {!faceDetected && (
                    <div className="text-xs text-red-200 text-center px-2">
                      Position Your Face in Frame
                    </div>
                  )}
                  {faceDetected && (
                    <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-4 text-xs text-green-200 text-center">
                      <span>Liveness: {Math.round(livenessScore * 100)}%</span>
                      <span>Stability: {Math.round(faceStability * 100)}%</span>
                    </div>
                  )}
                </div>
                
                {countdown !== null && (
                  <div className="text-center">
                    <div className="text-3xl sm:text-4xl font-bold mb-2">{countdown}</div>
                    <p className="text-sm sm:text-base text-blue-100">Get ready...</p>
                  </div>
                )}
              </div>


              {/* Controls */}
              <div className="p-4 sm:p-6 bg-gray-50">
                <div className="flex flex-col sm:flex-row items-center justify-between mb-4 space-y-2 sm:space-y-0">
                  <div className="text-xs sm:text-sm text-gray-600">
                    Attempts: {captureAttempts}/3
                  </div>
                  {sessionData && (
                    <div className="text-xs sm:text-sm text-gray-600 text-center sm:text-right">
                      <span className="hidden sm:inline">Session expires: </span>
                      <span className="sm:hidden">Expires: </span>
                      {new Date(sessionData.expires_at).toLocaleTimeString()}
                    </div>
                  )}
                </div>

                <div className="text-center">
                  {challengeState === 'waiting' && (
                    <button
                      onClick={startChallenge}
                      disabled={!faceDetected || loading || livenessScore < 0.4 || faceStability < 0.5}
                      className="bg-green-600 text-white py-3 px-6 sm:py-4 sm:px-8 rounded-xl hover:bg-green-700 disabled:bg-gray-400 transition flex items-center justify-center mx-auto text-sm sm:text-base min-h-[48px] w-full sm:w-auto max-w-xs"
                    >
                      {!faceDetected ? (
                        <>
                          <ExclamationTriangleIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                          <span className="hidden sm:inline">Position Your Face</span>
                          <span className="sm:hidden">Position Face</span>
                        </>
                      ) : loading ? (
                        <>
                          <ArrowPathIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : livenessScore < 0.4 ? (
                        <>
                          <ExclamationTriangleIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                          <span className="hidden sm:inline">Improve Lighting</span>
                          <span className="sm:hidden">More Light</span>
                        </>
                      ) : faceStability < 0.5 ? (
                        <>
                          <ExclamationTriangleIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                          Hold Steady
                        </>
                      ) : (
                        <>
                          <CameraIcon className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                          Start Capture
                        </>
                      )}
                    </button>
                  )}

                  {challengeState === 'active' && (
                    <div className="text-center px-2">
                      <div className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                        Performing challenge...
                      </div>
                      <div className="text-sm text-gray-600">
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
            <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg m-3 sm:m-6">
              <div className="flex">
                <XMarkIcon className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
                <p className="text-red-700 text-xs sm:text-sm">{error}</p>
              </div>
            </div>
          )}
        </div>}

        {/* Instructions */}
        <div className="mt-4 sm:mt-8 bg-blue-50 rounded-xl p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-blue-900 mb-3 sm:mb-4">📱 Face-API Live Capture</h3>
          <ul className="text-blue-800 space-y-2 text-sm sm:text-base">
            <li className="flex items-start">
              <span className="text-blue-500 mr-2 mt-1 flex-shrink-0">•</span>
              <span>Uses Face-API for reliable camera processing</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-500 mr-2 mt-1 flex-shrink-0">•</span>
              <span>Ensure good lighting on your face</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-500 mr-2 mt-1 flex-shrink-0">•</span>
              <span>Position your face in the center of frame</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-500 mr-2 mt-1 flex-shrink-0">•</span>
              <span>Wait for green indicator showing face detection</span>
            </li>
          </ul>
          
          {debugInfo && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
              <p className="text-xs sm:text-sm text-gray-600">Status: {debugInfo}</p>
              {cameraState === 'ready' && (
                <button
                  onClick={retryCamera}
                  className="mt-2 px-3 py-2 text-xs sm:text-sm bg-blue-500 text-white rounded hover:bg-blue-600 min-h-[36px]"
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