import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  AlertTriangle,
  X,
  Eye,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

// OpenCV types
declare global {
  interface Window {
    cv: any;
  }
}

interface LiveCaptureComponentProps {
  onCapture: (imageData: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const LiveCaptureComponent: React.FC<LiveCaptureComponentProps> = ({
  onCapture,
  onCancel,
  isLoading
}) => {
  const { t } = useTranslation();
  const [cameraState, setCameraState] = useState<'prompt' | 'initializing' | 'ready' | 'error'>('prompt');
  const [faceDetected, setFaceDetected] = useState(false);
  const [opencvReady, setOpencvReady] = useState(false);
  const [faceDetectionBuffer, setFaceDetectionBuffer] = useState<boolean[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const faceClassifierRef = useRef<any>(null);

  useEffect(() => {
    if (!opencvReady) {
      if (window.cv && window.cv.Mat) {
        setOpencvReady(true);
        loadFaceClassifier();
        return;
      }

      if (!document.getElementById('opencv-script')) {
        const script = document.createElement('script');
        script.id = 'opencv-script';
        script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
        script.async = true;
        script.onload = () => setTimeout(() => initOpenCV(), 100);
        script.onerror = () => setOpencvReady(false);
        document.head.appendChild(script);
      } else {
        setTimeout(() => initOpenCV(), 100);
      }
    }

    return () => cleanup();
  }, []);

  const initOpenCV = () => {
    if (window.cv && window.cv.Mat) {
      setOpencvReady(true);
      loadFaceClassifier();
    } else {
      setTimeout(initOpenCV, 200);
    }
  };

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (videoElementRef.current) {
      videoElementRef.current.srcObject = null;
      videoElementRef.current.pause();
      videoElementRef.current = null;
    }
    setCameraState('prompt');
    setFaceDetected(false);
    setFaceDetectionBuffer([]);
  };

  const loadFaceClassifier = async () => {
    if (!window.cv || !opencvReady) return;
    try {
      const response = await fetch('/models/haarcascade_frontalface_default.xml');
      if (!response.ok) return;
      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);
      window.cv.FS_createDataFile('/', 'haarcascade_frontalface_default.xml', data, true, false, false);
      faceClassifierRef.current = new window.cv.CascadeClassifier();
      if (!faceClassifierRef.current.load('haarcascade_frontalface_default.xml')) {
        faceClassifierRef.current = null;
      }
    } catch {
      faceClassifierRef.current = null;
    }
  };

  const initializeCamera = async () => {
    setCameraState('initializing');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access not supported');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });
      streamRef.current = stream;
      setCameraState('ready');
      setFaceDetected(false);
      setFaceDetectionBuffer([]);

      setTimeout(() => {
        if (videoElementRef.current) {
          videoElementRef.current.srcObject = stream;
          videoElementRef.current.onloadedmetadata = () => {
            videoElementRef.current?.play().then(() => {
              setTimeout(() => startFaceDetection(), 1000);
            }).catch(() => {});
          };
        }
      }, 100);
    } catch {
      setCameraState('error');
    }
  };

  const startFaceDetection = () => {
    if (!videoElementRef.current || !canvasRef.current) {
      setTimeout(() => {
        if (cameraState === 'ready' && videoElementRef.current && canvasRef.current) startFaceDetection();
      }, 200);
      return;
    }

    const detectFaces = () => {
      if (!videoElementRef.current || !canvasRef.current) {
        if (animationRef.current) animationRef.current = requestAnimationFrame(detectFaces);
        return;
      }

      try {
        const video = videoElementRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx || video.readyState < 2 || video.videoWidth === 0) {
          animationRef.current = requestAnimationFrame(detectFaces);
          return;
        }

        const canvasWidth = Math.max(video.clientWidth || 640, 320);
        const canvasHeight = Math.max(video.clientHeight || 480, 240);
        if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) * 0.22;

        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(10, 10, 280, 32);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Position your face in the circle', 15, 30);
        ctx.restore();

        let faceCount = 0;

        if (window.cv && window.cv.Mat && faceClassifierRef.current && opencvReady) {
          try {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              tempCanvas.width = video.videoWidth;
              tempCanvas.height = video.videoHeight;
              tempCtx.drawImage(video, 0, 0);
              const imageData = tempCtx.getImageData(0, 0, video.videoWidth, video.videoHeight);
              const src = window.cv.matFromImageData(imageData);
              const gray = new window.cv.Mat();
              const faces = new window.cv.RectVector();
              window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY);
              faceClassifierRef.current.detectMultiScale(gray, faces, 1.05, 2, 0, new window.cv.Size(30, 30));
              faceCount = faces.size();
              try { src.delete(); gray.delete(); faces.delete(); } catch {}
            }
          } catch {}
        } else {
          try {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
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
                const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
                const brightness = (r + g + b) / 3;
                totalBrightness += brightness;
                const isLight = r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15;
                const isMedium = r > 80 && g > 50 && b > 30 && r >= g && brightness > 60;
                const isDark = r > 60 && g > 40 && b > 25 && Math.abs(r - g) < 30 && brightness > 40;
                if ((isLight || isMedium || isDark) && brightness > 30 && brightness < 250) skinTonePixels++;
              }
              const avgBrightness = totalBrightness / pixelCount;
              const skinToneRatio = skinTonePixels / pixelCount;
              faceCount = (skinToneRatio > 0.02 && avgBrightness > 30 && avgBrightness < 240) ? 1 : 0;

              if (faceCount > 0) {
                const detSize = radius * 0.6;
                ctx.strokeStyle = '#4ade80';
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.5;
                ctx.strokeRect(centerX - detSize / 2, centerY - detSize / 2, detSize, detSize);
                ctx.globalAlpha = 1.0;
              }
            }
          } catch {
            faceCount = 0;
          }
        }

        setFaceDetectionBuffer(prev => {
          const newBuf = [...prev, faceCount > 0].slice(-5);
          const trueCount = newBuf.filter(Boolean).length;
          const falseCount = newBuf.filter(x => !x).length;
          if (trueCount >= 3 && !faceDetected) setFaceDetected(true);
          else if (falseCount >= 3 && faceDetected) setFaceDetected(false);
          return newBuf;
        });
      } catch {}

      animationRef.current = requestAnimationFrame(detectFaces);
    };

    animationRef.current = requestAnimationFrame(detectFaces);
  };

  const captureSelfie = async () => {
    if (!videoElementRef.current || !faceDetected) return;
    try {
      const video = videoElementRef.current;
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;
      const ctx = captureCanvas.getContext('2d');
      if (!ctx) throw new Error('Failed to create capture context');
      ctx.drawImage(video, 0, 0);
      const base64Data = captureCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      cleanup();
      onCapture(base64Data);
    } catch {
      alert('Failed to capture. Please try again.');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[#dde2ec]">{t('liveCapture.heading')}</h3>
        <button
          onClick={() => { cleanup(); onCancel(); }}
          className="text-[#8896aa] hover:text-[#dde2ec] transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4">
        {cameraState === 'prompt' && (
          <div className="text-center py-8">
            <Camera className="h-12 w-12 mx-auto text-cyan-400 mb-4" />
            <h4 className="text-lg font-semibold text-[#dde2ec] mb-2">{t('liveCapture.heading')}</h4>
            <p className="text-[#8896aa] text-sm mb-6">
              {t('liveCapture.description')}
            </p>
            <button onClick={initializeCamera} className="btn-primary">
              {t('liveCapture.captureButton')}
            </button>
          </div>
        )}

        {cameraState === 'initializing' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4" />
            <p className="text-[#8896aa]">{t('common.loading')}</p>
          </div>
        )}

        {cameraState === 'ready' && (
          <div className="space-y-4">
            <div className="relative bg-black rounded-xl overflow-hidden" style={{ minHeight: '240px', height: '320px' }}>
              <video
                ref={videoElementRef}
                autoPlay
                playsInline
                muted
                controls={false}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ display: 'block', backgroundColor: '#000', borderRadius: '0.75rem' }}
              />
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                style={{ display: 'block', backgroundColor: 'transparent', zIndex: 30, position: 'absolute' }}
              />

              <div className="absolute top-4 right-4">
                <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${
                  faceDetected ? 'bg-green-500/80 text-white' : 'bg-red-500/80 text-white'
                }`}>
                  <Eye className="h-4 w-4" />
                  <span>{faceDetected ? 'Face Detected' : 'No Face'}</span>
                </div>
              </div>

              <div className="absolute bottom-4 left-4 right-4">
                <div className="bg-black/70 text-white p-3 rounded-lg text-center">
                  <p className="text-sm">
                    {!faceDetected
                      ? 'Position your face within the circle'
                      : 'Great! Click capture when ready'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={captureSelfie}
                disabled={!faceDetected || isLoading}
                className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-colors ${
                  faceDetected && !isLoading
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : 'bg-[rgba(255,255,255,0.07)] text-[#8896aa] cursor-not-allowed'
                }`}
              >
                {isLoading ? t('common.processing') : t('liveCapture.captureButton')}
              </button>
              <button
                onClick={() => { cleanup(); onCancel(); }}
                className="px-6 py-3 bg-[rgba(255,255,255,0.07)] text-[#8896aa] rounded-xl font-semibold hover:bg-[rgba(255,255,255,0.12)] transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        )}

        {cameraState === 'error' && (
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 mx-auto text-red-400 mb-4" />
            <h4 className="text-lg font-semibold text-red-400 mb-2">{t('common.error')}</h4>
            <p className="text-[#8896aa] mb-6">
              Unable to access your camera. Please check permissions and try again.
            </p>
            <button onClick={initializeCamera} className="btn-primary">
              {t('common.tryAgain')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveCaptureComponent;
