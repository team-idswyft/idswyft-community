/** Verification result returned to the parent app */
export interface VerificationResult {
  verificationId: string;
  status: string;
  finalResult: 'verified' | 'manual_review' | 'failed';
}

/** Verification error */
export interface VerificationError {
  verificationId?: string;
  code: string;
  message: string;
}

/** Step progress update */
export interface StepProgress {
  current: number;
  total: number;
  status: string;
}

/** PostMessage protocol from the verification iframe */
export interface EmbedMessage {
  source: 'idswyft-embed';
  type: 'complete' | 'error' | 'step_change' | 'close' | 'ready';
  payload: any;
}

/** Props for the IdswyftVerification component */
export interface IdswyftVerificationProps {
  /** API key (ik_ prefix) */
  apiKey: string;
  /** User ID for this verification session */
  userId: string;
  /** Display mode: 'modal' (overlay) or 'inline' (within parent) */
  mode?: 'modal' | 'inline';
  /** Theme for the verification UI */
  theme?: 'light' | 'dark';
  /** Base URL for the hosted verification page */
  verificationUrl?: string;
  /** Width of the inline iframe (default: '100%') */
  width?: string;
  /** Height of the inline iframe (default: '700px') */
  height?: string;
  /** Allow closing the modal via backdrop click (default: true) */
  closeOnBackdropClick?: boolean;
  /** Document type to verify */
  documentType?: 'passport' | 'drivers_license' | 'national_id';
  /** Called when verification completes successfully */
  onComplete?: (result: VerificationResult) => void;
  /** Called on verification error */
  onError?: (error: VerificationError) => void;
  /** Called when the verification step changes */
  onStepChange?: (step: StepProgress) => void;
  /** Called when the user closes the verification UI */
  onClose?: () => void;
  /** Additional className for the container element (inline mode) */
  className?: string;
  /** Additional inline styles for the container */
  style?: React.CSSProperties;
}

/** Options for the useIdswyftVerification hook */
export interface UseVerificationOptions {
  /** API key (ik_ prefix) */
  apiKey: string;
  /** Base URL for the API (default: 'https://api.idswyft.app') */
  baseUrl?: string;
  /** Base URL for the hosted verification page */
  verificationUrl?: string;
  /** Theme for the verification UI */
  theme?: 'light' | 'dark';
}

/** Return type for the useIdswyftVerification hook */
export interface UseVerificationReturn {
  /** Open the verification modal for a user */
  open: (userId: string, options?: { documentType?: string }) => void;
  /** Close the verification UI */
  close: () => void;
  /** Whether the verification UI is currently open */
  isOpen: boolean;
  /** Current verification result (null until complete) */
  result: VerificationResult | null;
  /** Current error (null if no error) */
  error: VerificationError | null;
  /** Current step progress */
  step: StepProgress | null;
}
