// VERIFICATION FLOW - Routes between mobile (camera-first) and desktop (upload) flows
// Mobile detection: viewport width < 768px → MobileVerificationFlow (dark theme, guided camera)
// Desktop: ModernVerificationSystem (glass morphism, drag-and-drop upload)

import React, { useState, useEffect } from 'react';
import { ModernVerificationSystem } from './verification/ModernVerificationSystem';
import MobileVerificationFlow from './MobileVerificationFlow';

interface VerificationFlowProps {
  sessionToken: string;
  /** When true, hide header/footer and communicate via postMessage */
  embedMode?: boolean;
  /** Callback for embed mode — verification completed successfully */
  onEmbedComplete?: (result: { verificationId: string; status: string; finalResult: string }) => void;
  /** Callback for embed mode — verification error */
  onEmbedError?: (error: { code: string; message: string }) => void;
  /** Callback for embed mode — step changed */
  onEmbedStepChange?: (step: { current: number; total: number; status: string }) => void;
}

const MOBILE_BREAKPOINT = 768;

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

const VerificationFlow: React.FC<VerificationFlowProps> = ({
  sessionToken,
  embedMode,
  onEmbedComplete,
  onEmbedError,
  onEmbedStepChange,
}) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileVerificationFlow sessionToken={sessionToken} />;
  }

  return <ModernVerificationSystem sessionToken={sessionToken} />;
};

export default VerificationFlow;
