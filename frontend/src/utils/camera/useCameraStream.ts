import { useRef, useCallback } from 'react';

/**
 * Shared hook that manages a camera MediaStream and its associated animation frame.
 *
 * Returns refs for the stream and animation frame, plus a `stopStream` callback
 * that cancels the animation loop and stops all media tracks.
 */
export function useCameraStream() {
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  const stopStream = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  return { streamRef, animFrameRef, stopStream };
}
