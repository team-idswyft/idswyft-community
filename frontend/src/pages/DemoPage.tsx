import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { API_BASE_URL, shouldUseSandbox } from '../config/api';
import { BackOfIdUpload } from '../components/BackOfIdUpload';
import {
  CameraIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { ContinueOnPhone } from '../components/ContinueOnPhone';
import { C, injectFonts } from '../theme';

// OpenCV types
declare global {
  interface Window {
    cv: any;
  }
}

interface Document {
  id: string;
  file_name: string;
  file_path: string;
  document_type: string;
  ocr_data?: {
    document_number?: string;
    full_name?: string;
    date_of_birth?: string;
    expiry_date?: string;
    nationality?: string;
    place_of_birth?: string;
  };
}

interface VerificationRequest {
  id: string;
  verification_id?: string;
  status: string;
  final_result?: 'verified' | 'failed' | 'manual_review' | null;
  documents: Document[];
  selfie_id?: string;
  created_at: string;
  updated_at: string;
  ocr_data?: {
    document_number?: string;
    full_name?: string;
    date_of_birth?: string;
    expiry_date?: string;
    nationality?: string;
    place_of_birth?: string;
  };
  cross_validation_results?: { weighted_score?: number; [key: string]: any } | null;
  face_match_results?: { score?: number; [key: string]: any } | null;
  liveness_results?: { liveness_score?: number; [key: string]: any } | null;
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

const getErrorMessage = (errorData: any, fallback: string): string => {
  if (!errorData) return fallback;
  if (typeof errorData === 'string') return errorData;
  if (typeof errorData.message === 'string') return errorData.message;
  if (typeof errorData.error === 'string') return errorData.error;
  if (errorData.error && typeof errorData.error.message === 'string') return errorData.error.message;
  if (Array.isArray(errorData.errors) && errorData.errors.length > 0) {
    const first = errorData.errors[0];
    if (typeof first === 'string') return first;
    if (first && typeof first.msg === 'string') return first.msg;
  }
  return fallback;
};

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
  const [backOfIdUploaded, setBackOfIdUploaded] = useState(false);
  const [documentType, setDocumentType] = useState<string>('');
  
  // Demo form fields
  const [apiKey, setApiKey] = useState(urlApiKey || '');
  const [userId, setUserId] = useState('');

  // Live capture state
  const [showLiveCapture, setShowLiveCapture] = useState(false);
  const [_sessionData, _setSessionData] = useState<LiveCaptureSession | null>(null);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [cameraState, setCameraState] = useState<'prompt' | 'initializing' | 'ready' | 'error'>('prompt');
  const [_challengeState, setChallengeState] = useState<'waiting' | 'active' | 'completed'>('waiting');
  const [_countdown, _setCountdown] = useState<number | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [_captureAttempts, _setCaptureAttempts] = useState(0);
  const [opencvReady, setOpencvReady] = useState(false);
  const [_faceDetectionBuffer, setFaceDetectionBuffer] = useState<boolean[]>([]);
  const [mobileHandoffDone, setMobileHandoffDone] = useState(false);
  const [mobileResult, setMobileResult] = useState<any>(null);
  
  // Refs for live capture
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const faceClassifierRef = useRef<any>(null);

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

  // Inject brand fonts
  useEffect(() => { injectFonts(); }, []);

  // Load OpenCV script when needed
  useEffect(() => {
    if (showLiveCapture && !opencvReady) {
      // Check if OpenCV is already available globally
      if (window.cv && window.cv.Mat) {
        console.log('🔧 OpenCV already available, initializing...');
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
          console.log('🔧 OpenCV script loaded');
          // Add delay to ensure OpenCV is fully initialized
          setTimeout(() => {
            initOpenCV();
          }, 100);
        };
        script.onerror = () => {
          console.error('🔧 Failed to load OpenCV script');
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
    };
  }, []);

  const initOpenCV = () => {
    if (window.cv && window.cv.Mat) {
      console.log('🔧 OpenCV ready for live capture');
      setOpencvReady(true);
      loadFaceClassifier();
    } else {
      console.log('🔧 Waiting for OpenCV to be ready...');
      setTimeout(initOpenCV, 200);
    }
  };

  // Load verification results when coming from live capture
  useEffect(() => {
    if (urlVerificationId && apiKey && currentStep === 5) {
      loadVerificationResults(urlVerificationId);
    }
  }, [urlVerificationId, apiKey, currentStep]);

  const loadVerificationResults = async (verificationId: string) => {
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
        setVerificationId(verificationId);
      }
    } catch (error) {
      console.error('Failed to load verification results:', error);
    }
  };

  // Cleanup function for camera and OpenCV resources
  const cleanup = () => {
    console.log('🧹 Starting cleanup...');
    
    // Stop all media tracks
    if (streamRef.current) {
      console.log('📹 Stopping camera tracks...');
      streamRef.current.getTracks().forEach(track => {
        console.log(`🔴 Stopping track: ${track.kind}, state: ${track.readyState}`);
        track.stop();
      });
      streamRef.current = null;
    }
    
    // Cancel face detection animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      console.log('🔍 Face detection animation cancelled');
    }
    
    // Clean up video element
    if (videoElementRef.current) {
      console.log('📺 Cleaning up video element...');
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
    
    console.log('✅ Cleanup completed');
  };

  // Load OpenCV face classifier
  const loadFaceClassifier = async () => {
    if (!window.cv || !opencvReady) return;
    
    try {
      // Try to load the face cascade classifier
      const faceCascadeFile = '/models/haarcascade_frontalface_default.xml';
      
      const response = await fetch(faceCascadeFile);
      if (!response.ok) {
        console.warn('Face classifier file not found, using basic detection');
        // Set a flag that we're ready even without the classifier
        console.log('🔧 OpenCV ready without face classifier - using basic detection');
        return;
      }
      
      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);
      window.cv.FS_createDataFile('/', 'haarcascade_frontalface_default.xml', data, true, false, false);
      faceClassifierRef.current = new window.cv.CascadeClassifier();
      const loaded = faceClassifierRef.current.load('haarcascade_frontalface_default.xml');
      
      if (loaded) {
        console.log('🔧 Face classifier loaded successfully');
      } else {
        console.warn('Face classifier failed to load, using basic detection');
        faceClassifierRef.current = null;
      }
    } catch (error) {
      console.error('Face classifier loading failed:', error);
      faceClassifierRef.current = null;
      console.log('🔧 Continuing with basic detection');
    }
  };

  // Start verification session
  const startVerification = async () => {
    // Validate inputs
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
        ...(useSandbox && { sandbox: true })
      };

      console.log('🔧 Start Verification Debug:');
      console.log('🔧 Sandbox mode:', useSandbox);
      console.log('🔧 API Key (first 10):', apiKey?.substring(0, 10));
      console.log('🔧 Request body:', requestBody);

      const response = await fetch(`${API_BASE_URL}/api/v2/verify/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('🔧 Start verification response status:', response.status);

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const errorData = contentType.includes('application/json')
          ? await response.json()
          : { message: await response.text() };
        console.log('🔧 Start verification error response:', errorData);
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

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a JPEG, PNG, or PDF file');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  // Upload document
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

      // Build URL with sandbox query parameter if needed
      const url = new URL(`${API_BASE_URL}/api/v2/verify/${verificationId}/front-document`);
      if (useSandbox) {
        url.searchParams.append('sandbox', 'true');
      }

      console.log('🔧 Document Upload Debug:');
      console.log('🔧 Sandbox mode:', useSandbox);
      console.log('🔧 API Key (first 10):', apiKey?.substring(0, 10));
      console.log('🔧 Verification ID:', verificationId);
      console.log('🔧 Upload URL:', url.toString());
      console.log('🔧 FormData entries:', Array.from(formData.entries()).map(([key, value]) => 
        key === 'document' ? [key, `${value.constructor.name} (${(value as File).size} bytes)`] : [key, value]
      ));

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
        },
        body: formData,
      });

      console.log('🔧 Upload response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.log('🔧 Upload error response:', errorData);
        throw new Error(errorData.error || errorData.message || 'Failed to upload document');
      }

      await response.json();
      // Document upload successful, start polling for OCR results
      setCurrentStep(3);
      toast.success('Document uploaded successfully');
      
      // Start polling for OCR results
      pollForOCRResults();
    } catch (error) {
      console.error('Failed to upload document:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload document');
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  // Poll for OCR results
  const pollForOCRResults = () => {
    const pollInterval = setInterval(async () => {
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
          
          // Check if OCR data is available
          if (data.ocr_data && Object.keys(data.ocr_data).length > 0) {
            clearInterval(pollInterval);
            setCurrentStep(4);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);

    // Clear interval after 30 seconds
    setTimeout(() => clearInterval(pollInterval), 30000);
  };

  // Initialize camera for live capture
  const initializeCamera = async () => {
    console.log('🎥 Initializing camera...');
    setCameraState('initializing');
    
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported in this browser');
      }

      console.log('🎥 Requesting camera permissions...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640, min: 320, max: 1280 },
          height: { ideal: 480, min: 240, max: 720 },
          facingMode: 'user'
        },
        audio: false
      });
      
      console.log('🎥 Camera stream obtained', {
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
          console.log('🎥 Connecting stream to video element...');
          videoElementRef.current.srcObject = stream;
          
          videoElementRef.current.onloadedmetadata = () => {
            console.log('🎥 Video metadata loaded, starting playback...');
            if (videoElementRef.current) {
              videoElementRef.current.play().then(() => {
                console.log('🎥 Video playing, starting face detection...');
                // Start face detection after a short delay to ensure video is fully loaded
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
          console.warn('🎥 Video element not found in DOM yet, retrying...');
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

  // Start face detection loop
  const startFaceDetection = () => {
    console.log('🔍 Starting face detection...', {
      hasVideo: !!videoElementRef.current,
      hasCanvas: !!canvasRef.current,
      hasOpenCV: !!window.cv,
      hasClassifier: !!faceClassifierRef.current,
      cameraState
    });
    
    console.log('🚀 FACE DETECTION LOOP STARTING NOW!');

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
      // Face detection initiated
      
      if (!videoElementRef.current || !canvasRef.current) {
        // Stop detection if elements are missing
        console.warn('🚨 Early return from detectFaces - missing elements:', {
          hasVideo: !!videoElementRef.current,
          hasCanvas: !!canvasRef.current,
          cameraState: cameraState
        });
        
        // Retry if we're in a valid camera state
        if (cameraState === 'ready' || showLiveCapture) {
          setTimeout(() => {
            if (cameraState === 'ready' || showLiveCapture) {
              animationRef.current = requestAnimationFrame(detectFaces);
            }
          }, 100);
        }
        return;
      }
      
      // Check if we should be running face detection based on live capture state
      if (!showLiveCapture) {
        console.warn('🚨 Early return from detectFaces - live capture not active:', {
          showLiveCapture: showLiveCapture,
          cameraState: cameraState
        });
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

        // Check if video is ready and has dimensions
        if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
          // Video not ready yet, continue loop
          console.log('📹 Video not ready yet:', {
            readyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
          });
          animationRef.current = requestAnimationFrame(detectFaces);
          return;
        }

        // Set canvas dimensions to match video element display size, not video source size
        const displayWidth = video.clientWidth || 640;
        const displayHeight = video.clientHeight || 480;
        
        // Force canvas to have at least minimum dimensions
        const canvasWidth = Math.max(displayWidth, 320);
        const canvasHeight = Math.max(displayHeight, 240);
        
        if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          console.log('🎥 Canvas resized to match video display:', { 
            width: canvasWidth, 
            height: canvasHeight,
            videoDisplay: `${displayWidth}x${displayHeight}`,
            videoClient: `${video.clientWidth}x${video.clientHeight}`
          });
        }
        
        // Debug: Log face detection loop activity
        if (Math.random() < 0.1) { // Log every ~10th frame to avoid spam
          console.log('🔍 Face detection loop running:', {
            canvasSize: `${canvas.width}x${canvas.height}`,
            videoSize: `${video.videoWidth}x${video.videoHeight}`,
            displaySize: `${displayWidth}x${displayHeight}`
          });
        }
        
        // Clear canvas (we'll only draw overlays, not the video itself)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw circular guide overlay
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
        
        // Add instruction text background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(10, 10, 320, 40);
        
        // Add instruction text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('Position your face in the blue circle', 20, 30);
        
        // Try OpenCV face detection if available
        let faceCount = 0;
        // Check face detection capabilities
        
        if (window.cv && window.cv.Mat && faceClassifierRef.current && opencvReady) {
          console.log('🔍 OPENCV: Attempting OpenCV face detection');
          try {
            // Create a temporary canvas to get image data from video
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            if (tempCtx) {
              // Use video's actual dimensions for processing
              const videoWidth = video.videoWidth;
              const videoHeight = video.videoHeight;
              tempCanvas.width = videoWidth;
              tempCanvas.height = videoHeight;
              
              tempCtx.drawImage(video, 0, 0, videoWidth, videoHeight);
              const imageData = tempCtx.getImageData(0, 0, videoWidth, videoHeight);
              
              const src = window.cv.matFromImageData(imageData);
              const gray = new window.cv.Mat();
              const faces = new window.cv.RectVector();
              
              // Convert to grayscale and detect faces
              window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);
              // Use more lenient parameters: scale=1.05, minNeighbors=2, minSize=30x30
              faceClassifierRef.current.detectMultiScale(gray, faces, 1.05, 2, 0, new window.cv.Size(30, 30));
              
              faceCount = faces.size();
              console.log(`🔍 OPENCV: Detected ${faceCount} faces`);
              
              // Face detection successful - count recorded but no visual overlay drawn
              
              // Cleanup OpenCV objects
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
            // Create a temporary canvas to get image data from video
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) throw new Error('Could not get temp canvas context');
            
            // Set temp canvas size to match video
            tempCanvas.width = video.videoWidth;
            tempCanvas.height = video.videoHeight;
            
            // Draw current video frame to temp canvas
            tempCtx.drawImage(video, 0, 0);
            
            // Get image data from center region where face should be
            const faceRegionSize = Math.min(video.videoWidth, video.videoHeight) * 0.4;
            const startX = (video.videoWidth - faceRegionSize) / 2;
            const startY = (video.videoHeight - faceRegionSize) / 2;
            
            const imageData = tempCtx.getImageData(startX, startY, faceRegionSize, faceRegionSize);
            const pixels = imageData.data;
            
            // Calculate average brightness and detect skin tone patterns
            let totalBrightness = 0;
            let skinTonePixels = 0;
            const pixelCount = pixels.length / 4;
            
            for (let i = 0; i < pixels.length; i += 4) {
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];
              
              // Calculate brightness
              const brightness = (r + g + b) / 3;
              totalBrightness += brightness;
              
              // More flexible skin tone detection
              const isLightSkin = r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15;
              const isMediumSkin = r > 80 && g > 50 && b > 30 && r >= g && brightness > 60;
              const isDarkSkin = r > 60 && g > 40 && b > 25 && Math.abs(r - g) < 30 && brightness > 40;
              
              if ((isLightSkin || isMediumSkin || isDarkSkin) && brightness > 30 && brightness < 250) {
                skinTonePixels++;
              }
            }
            
            const avgBrightness = totalBrightness / pixelCount;
            const skinToneRatio = skinTonePixels / pixelCount;
            
            // Detect face based on skin tone presence and brightness variation
            const hasFaceFeatures = skinToneRatio > 0.02 && avgBrightness > 30 && avgBrightness < 240;
            faceCount = hasFaceFeatures ? 1 : 0;
            
            // Fallback face detection analysis
            console.log('🔍 FALLBACK Face detection:', { 
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
              // Draw simple detection indicator in center area
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
        
        // Add current detection to buffer for stability
        const currentDetection = faceCount > 0;
        setFaceDetectionBuffer(prev => {
          const newBuffer = [...prev, currentDetection].slice(-5); // Keep last 5 detections
          
          // Only update faceDetected if we have consistent results
          const trueCount = newBuffer.filter(Boolean).length;
          const falseCount = newBuffer.filter(x => !x).length;
          
          if (trueCount >= 3 && !faceDetected) {
            // Face has been detected consistently for 3+ frames
            setFaceDetected(true);
          } else if (falseCount >= 3 && faceDetected) {
            // Face has been missing consistently for 3+ frames
            setFaceDetected(false);
          }
          
          return newBuffer;
        });
        
      } catch (error) {
        console.error('Face detection error:', error);
      }
      
      // Continue the animation loop
      animationRef.current = requestAnimationFrame(detectFaces);
    };
    
    console.log('🔍 Starting face detection animation loop');
    animationRef.current = requestAnimationFrame(detectFaces);
  };

  // Capture selfie
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
      // Create a capture canvas from the video
      const video = videoElementRef.current;
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;
      
      const captureCtx = captureCanvas.getContext('2d');
      if (!captureCtx) {
        throw new Error('Failed to create capture context');
      }
      
      // Draw the current video frame to capture canvas
      captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
      
      // Convert to blob
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

      // v2: Send blob directly as multipart FormData (no base64 round-trip)
      const formData = new FormData();
      formData.append('selfie', blob, 'selfie.jpg');

      console.log('📸 Capturing selfie...', { verificationId });

      const response = await fetch(`${API_BASE_URL}/api/v2/verify/${verificationId}/live-capture`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Live capture failed');
      }

      const result = await response.json();
      setCaptureResult(result);
      setChallengeState('completed');
      
      toast.success('Selfie captured successfully!');
      
      // Immediately cleanup camera resources
      console.log('📸 Selfie captured, cleaning up camera...');
      cleanup();
      
      // Hide live capture interface
      setShowLiveCapture(false);
      
      // Load verification results and move to next step
      setTimeout(() => {
        loadVerificationResults(verificationId);
        setCurrentStep(5);
      }, 1000);

    } catch (error) {
      console.error('Selfie capture failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to capture selfie');
      setChallengeState('waiting');
      
      // Clean up camera on error as well
      console.log('❌ Selfie capture failed, cleaning up camera...');
      cleanup();
      setShowLiveCapture(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle live capture
  const handleLiveCapture = async () => {
    if (!apiKey || !verificationId) {
      toast.error('Please start verification session and upload document first');
      return;
    }

    setShowLiveCapture(true);
    setCameraState('prompt');
  };

  // Skip live capture - just proceed to results
  const skipLiveCapture = async () => {
    try {
      // Get results from the verification
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
      setCurrentStep(5);
      toast.success('Verification completed without live capture');
    } catch (error) {
      console.error('Failed to get verification results:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to get verification results');
    }
  };

  // Render progress indicator
  const renderProgressIndicator = () => {
    const steps = ['Start', 'Front ID', 'Back ID', 'Live Capture', 'Results'];
    return (
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {steps.map((label, i) => {
            const stepNum = i + 1;
            const isCompleted = stepNum < currentStep;
            const isActive    = stepNum === currentStep;
            return (
              <React.Fragment key={stepNum}>
                <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 72 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 6px',
                    fontFamily: '"IBM Plex Mono","Fira Code",monospace',
                    fontSize: 12, fontWeight: 600,
                    background: isCompleted ? '#34d399' : isActive ? 'rgba(34,211,238,0.15)' : 'transparent',
                    border: isCompleted ? '1px solid #34d399' : isActive ? '1px solid #22d3ee' : '1px solid rgba(255,255,255,0.07)',
                    color: isCompleted ? '#080c14' : isActive ? '#22d3ee' : '#4a5568',
                    transition: 'all 0.2s',
                  }}>
                    {isCompleted ? '✓' : stepNum}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap',
                    color: isActive ? '#22d3ee' : isCompleted ? '#8896aa' : '#4a5568',
                  }}>
                    {label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div style={{ flex: 1, height: 1, marginTop: 16, background: stepNum < currentStep ? '#34d399' : 'rgba(255,255,255,0.07)', transition: 'background 0.3s' }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  // Render embedded live capture
  const renderLiveCapture = () => (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>Live Selfie Capture</h3>
        <button
          onClick={() => { cleanup(); setShowLiveCapture(false); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4, display: 'flex' }}
        >
          <XMarkIcon style={{ width: 18, height: 18 }} />
        </button>
      </div>

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
                console.log('🎥 Video metadata loaded in UI');
                if (videoElementRef.current) {
                  videoElementRef.current.play().then(() => {
                    console.log('🎥 Video playing in UI');
                  }).catch(err => { console.error('🎥 Video play error:', err); });
                }
              }}
              onError={(e) => { console.error('🎥 Video element error:', e); }}
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
              onClick={() => { cleanup(); setShowLiveCapture(false); }}
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
    </div>
  );

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div style={{ padding: '8px 0' }}>
            {mobileHandoffDone ? (
              <div style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center', padding: '32px 0' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.1)',
                  border: `1px solid ${mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? '#34d399' : '#f87171'}`,
                  fontSize: 24,
                  color: mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? '#34d399' : '#f87171',
                }}>
                  {mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? '✓' : '✗'}
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 600, color: '#dde2ec', marginBottom: 6 }}>
                  {mobileResult?.status === 'verified' || mobileResult?.status === 'completed' ? 'Verification Complete' : mobileResult?.status === 'failed' ? 'Verification Failed' : 'Under Review'}
                </h2>
                <p style={{ color: '#8896aa', fontSize: 13 }}>Completed on mobile device</p>
                {mobileResult?.confidence_score != null && (
                  <p style={{ color: '#8896aa', fontSize: 13, marginTop: 8 }}>
                    Confidence: {Math.round(mobileResult.confidence_score * 100)}%
                  </p>
                )}
                {(mobileResult?.status === 'failed' || mobileResult?.status === 'manual_review') && (
                  <button
                    onClick={() => { setMobileHandoffDone(false); setMobileResult(null); }}
                    style={{ marginTop: 16, background: 'none', border: 'none', color: '#22d3ee', cursor: 'pointer', fontSize: 13 }}
                  >
                    Try Again
                  </button>
                )}
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#dde2ec', textAlign: 'center', marginBottom: 6 }}>
                  Live Verification Demo
                </h2>
                <p style={{ color: '#8896aa', fontSize: 13, textAlign: 'center', marginBottom: 28 }}>
                  Enter your API key, then verify on this device or scan to use your phone.
                </p>

                <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#8896aa', marginBottom: 6, fontWeight: 500 }}>
                      API Key
                    </label>
                    <input
                      type="text"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk_test_your_api_key_here"
                      style={{ background: '#0f1420', border: '1px solid rgba(255,255,255,0.07)', color: '#dde2ec', borderRadius: 6, padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                    <p style={{ marginTop: 4, fontSize: 11, color: '#4a5568' }}>
                      Get your key from the <a href="/developer" style={{ color: '#22d3ee', textDecoration: 'none' }}>Developer page</a>
                    </p>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#8896aa', marginBottom: 6, fontWeight: 500 }}>
                      User ID
                    </label>
                    <input
                      type="text"
                      value={userId}
                      onChange={(e) => setUserId(e.target.value)}
                      placeholder="Auto-generated UUID"
                      style={{ background: '#0f1420', border: '1px solid rgba(255,255,255,0.07)', color: '#dde2ec', borderRadius: 6, padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 600, margin: '0 auto' }}>
                  <div style={{ background: '#0b0f19', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
                    <div style={{ fontSize: 13, color: '#dde2ec', fontWeight: 600 }}>Start Here</div>
                    <p style={{ fontSize: 12, color: '#8896aa', lineHeight: 1.5 }}>Upload documents and use webcam on this device.</p>
                    <button
                      onClick={startVerification}
                      disabled={isLoading || !apiKey.trim() || !userId.trim()}
                      style={{ background: '#22d3ee', color: '#080c14', border: 'none', borderRadius: 8, padding: '9px 0', width: '100%', fontWeight: 600, fontSize: 13, cursor: isLoading || !apiKey.trim() || !userId.trim() ? 'not-allowed' : 'pointer', opacity: isLoading || !apiKey.trim() || !userId.trim() ? 0.5 : 1 }}
                    >
                      {isLoading ? 'Starting…' : 'Start on This Device'}
                    </button>
                  </div>
                  <ContinueOnPhone
                    apiKey={apiKey}
                    userId={userId}
                    onComplete={(result) => {
                      setMobileResult(result);
                      setMobileHandoffDone(true);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        );

      case 2:
        return (
          <div style={{ padding: '8px 0' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, textAlign: 'center', marginBottom: 6 }}>Upload Your ID Document</h2>
            <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
              Upload a clear photo of your government-issued ID.
            </p>
            <div style={{ maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 500 }}>Document Type</label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: '10px 14px', width: '100%', fontSize: 14, outline: 'none' }}
                >
                  <option value="">Select document type</option>
                  <option value="national_id">National ID</option>
                  <option value="drivers_license">Driver's License</option>
                  <option value="passport">Passport</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <label htmlFor="document-upload" style={{ display: 'block', border: `2px dashed ${C.border}`, borderRadius: 8, padding: '32px 16px', textAlign: 'center', cursor: 'pointer' }}>
                <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={handleFileSelect} style={{ display: 'none' }} id="document-upload" />
                <svg style={{ width: 40, height: 40, margin: '0 auto 12px', color: C.muted }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p style={{ color: C.muted, fontSize: 13 }}>Click to upload or drag and drop</p>
                <p style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>JPEG, PNG or PDF (max 10MB)</p>
              </label>
              {selectedFile && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                  <p style={{ fontWeight: 500, color: C.text, fontSize: 13, margin: 0 }}>{selectedFile.name}</p>
                  <p style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  {previewUrl && (
                    <img src={previewUrl} alt="Document preview" style={{ width: '100%', height: 160, objectFit: 'contain', background: C.codeBg, borderRadius: 6, marginTop: 12 }} />
                  )}
                </div>
              )}
              {selectedFile && !documentType && (
                <p style={{ color: C.red, fontSize: 12, textAlign: 'center', margin: 0 }}>Please select a document type before uploading.</p>
              )}
              {selectedFile && (
                <button
                  onClick={uploadDocument}
                  disabled={isLoading || !documentType}
                  style={{ background: C.cyan, color: C.bg, border: 'none', borderRadius: 8, padding: '11px 0', width: '100%', fontWeight: 600, fontSize: 14, cursor: isLoading || !documentType ? 'not-allowed' : 'pointer', opacity: isLoading || !documentType ? 0.5 : 1 }}
                >
                  {isLoading ? 'Uploading...' : 'Upload Document'}
                </button>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 20 }}>Processing Document</h2>
            <div className="animate-spin" style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${C.border}`, borderTopColor: C.cyan, margin: '0 auto 16px' }} />
            <p style={{ color: C.muted, fontSize: 13 }}>
              Extracting information with OCR and PDF417 barcode scanning…
            </p>
          </div>
        );

      case 4:
        const ocrData = verificationRequest?.ocr_data;
        return (
          <div style={{ padding: '8px 0' }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: C.text, textAlign: 'center', marginBottom: 20 }}>Document Information & Verification</h2>
            {ocrData && Object.keys(ocrData).length > 0 ? (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, marginBottom: 20 }}>
                <h3 style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Extracted Information</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ocrData.full_name && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: C.muted }}>Full Name</span>
                      <span style={{ color: C.text, fontWeight: 500 }}>{ocrData.full_name}</span>
                    </div>
                  )}
                  {ocrData.document_number && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: C.muted }}>Document Number</span>
                      <span style={{ color: C.text, fontWeight: 500, fontFamily: C.mono }}>{ocrData.document_number}</span>
                    </div>
                  )}
                  {ocrData.date_of_birth && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: C.muted }}>Date of Birth</span>
                      <span style={{ color: C.text, fontWeight: 500 }}>{ocrData.date_of_birth}</span>
                    </div>
                  )}
                  {ocrData.expiry_date && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: C.muted }}>Expiry Date</span>
                      <span style={{ color: C.text, fontWeight: 500 }}>{ocrData.expiry_date}</span>
                    </div>
                  )}
                  {ocrData.nationality && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: C.muted }}>Nationality</span>
                      <span style={{ color: C.text, fontWeight: 500 }}>{ocrData.nationality}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ background: C.amberDim, border: `1px solid ${C.amber}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <p style={{ color: C.amber, fontSize: 13, margin: 0 }}>Document information could not be extracted automatically.</p>
              </div>
            )}

            {!backOfIdUploaded && (
              <div style={{ marginBottom: 20 }}>
                <BackOfIdUpload
                  verificationId={verificationId!}
                  documentType={documentType || 'national_id'}
                  apiKey={apiKey}
                  onUploadComplete={(result) => {
                    console.log('Back-of-ID upload completed:', result);
                    setBackOfIdUploaded(true);
                    toast.success('Back-of-ID uploaded successfully with PDF417 parsing!');
                  }}
                  onUploadError={(error) => {
                    console.error('Back-of-ID upload error:', error);
                    toast.error(error);
                  }}
                />
              </div>
            )}

            {backOfIdUploaded && (
              <div style={{ background: C.greenDim, border: `1px solid ${C.green}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.green, fontSize: 13, fontWeight: 600 }}>
                  <span>✓</span>
                  <span>Enhanced Verification Complete</span>
                </div>
                <p style={{ color: C.green, fontSize: 12, marginTop: 6, opacity: 0.8, margin: '6px 0 0' }}>
                  Back-of-ID processed with PDF417 barcode scanning, QR code detection, and cross-validation.
                </p>
              </div>
            )}

            {backOfIdUploaded && showLiveCapture && renderLiveCapture()}

            {backOfIdUploaded && !showLiveCapture && (
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>Identity Verification</h3>
                <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>
                  Verify you're the person in the document using live capture.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360, margin: '0 auto' }}>
                  <button
                    onClick={handleLiveCapture}
                    style={{ background: C.cyan, color: C.bg, border: 'none', borderRadius: 8, padding: '11px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <CameraIcon style={{ width: 18, height: 18 }} />
                    Start Live Capture
                  </button>
                  <button
                    onClick={skipLiveCapture}
                    style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                  >
                    Skip Live Capture
                  </button>
                </div>
              </div>
            )}

            {!backOfIdUploaded && (
              <div style={{ background: C.blueDim, border: `1px solid ${C.blue}`, borderRadius: 8, padding: 20, textAlign: 'center' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: C.blue, marginBottom: 6 }}>Next Step: Upload Back-of-ID</h3>
                <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>
                  Upload the back of your ID for enhanced verification with PDF417 barcode scanning.
                </p>
              </div>
            )}
          </div>
        );

      case 5:
        // v2: final_result has user-facing status, status has internal machine state
        const status = verificationRequest?.final_result ?? verificationRequest?.status;
        const isVerified = status === 'verified';
        const isFailed = status === 'failed';
        const statusTone = isVerified ? C.green : isFailed ? C.red : C.amber;
        const statusBg = isVerified ? C.greenDim : isFailed ? C.redDim : C.amberDim;
        const statusIcon = isVerified ? '✓' : isFailed ? '✗' : '⚠';
        const statusLabel = isVerified ? 'Verification Complete' : isFailed ? 'Verification Failed' : 'Under Review';
        return (
          <div style={{ padding: '8px 0', textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: statusBg, border: `1px solid ${statusTone}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24, color: statusTone }}>
              {statusIcon}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: C.text, marginBottom: 8 }}>{statusLabel}</h2>
            <p style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>
              {isVerified && 'Successfully verified with live capture and PDF417 validation.'}
              {isFailed && 'Verification failed. Please try again with clearer documents.'}
              {!isVerified && !isFailed && 'Your verification is under manual review.'}
            </p>
            {verificationRequest?.verification_id && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, textAlign: 'left', maxWidth: 400, margin: '0 auto 20px' }}>
                <h3 style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, marginBottom: 12, fontWeight: 600 }}>Verification Details</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: C.muted }}>ID</span>
                    <span style={{ color: C.text, fontFamily: C.mono, fontSize: 11 }}>{verificationRequest.verification_id?.slice(0, 8)}…</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: C.muted }}>Status</span>
                    <span style={{ color: statusTone, fontWeight: 600, textTransform: 'capitalize' }}>{verificationRequest.final_result ?? verificationRequest.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: C.muted }}>Created</span>
                    <span style={{ color: C.text }}>{verificationRequest.created_at ? new Date(verificationRequest.created_at).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  {captureResult && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: C.muted }}>Live Capture</span>
                      <span style={{ color: C.green }}>✓ Complete</span>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600, fontFamily: C.mono }}>Raw API Response</div>
                  <pre style={{ background: C.codeBg, color: C.code, padding: 12, borderRadius: 6, fontSize: 10, fontFamily: C.mono, overflowX: 'auto', maxHeight: 200, overflowY: 'auto', lineHeight: 1.5, margin: 0 }}>
                    {JSON.stringify(verificationRequest, null, 2)}
                  </pre>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('verification_id');
                newUrl.searchParams.delete('step');
                newUrl.searchParams.set('step', '1');
                window.location.href = newUrl.toString();
              }}
              style={{ background: C.cyan, color: C.bg, border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              Start New Demo
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ background: C.bg, fontFamily: C.sans, color: C.text, minHeight: '100vh' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, letterSpacing: '0.08em', marginBottom: 24 }}>
          idswyft / live-demo
        </div>
        <h1 style={{ fontFamily: C.mono, fontSize: 24, fontWeight: 600, color: C.text, marginBottom: 8 }}>
          Live Demo
        </h1>
        <p style={{ color: C.muted, fontSize: 14, marginBottom: 36 }}>
          Try a complete verification with a sandbox key. No signup required.
        </p>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 32 }}>
          {renderProgressIndicator()}
          {renderStepContent()}
        </div>
      </div>
    </div>
  );
};

export { DemoPage };
export default DemoPage;
