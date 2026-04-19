import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import EndUserVerification from '../components/verification/EndUserVerification';
import { ContinueOnPhone } from '../components/ContinueOnPhone';
import { C, injectFonts } from '../theme';
import { API_BASE_URL, buildApiUrl, shouldUseSandbox } from '../config/api';

// ─── State machine ─────────────────────────────────────────────────
// 'choice'     → user picks mobile or desktop
// 'mobile-qr'  → ContinueOnPhone in full-page dark wrapper
// 'desktop'    → EndUserVerification with dark theme
// 'address'    → optional address verification (when address_verif=true)
// ────────────────────────────────────────────────────────────────────
type Phase = 'choice' | 'mobile-qr' | 'desktop' | 'address' | 'completed';

interface PageBranding {
  logo_url: string | null;
  accent_color: string | null;
  company_name: string | null;
}

interface PageBuilderConfig {
  headerTitle?: string;
  headerSubtitle?: string;
  showPoweredBy?: boolean;
  theme?: 'dark' | 'light';
  backgroundColor?: string;
  cardBackgroundColor?: string;
  textColor?: string;
  fontFamily?: 'dm-sans' | 'inter' | 'system';
  steps?: {
    front?: { enabled?: boolean; label?: string };
    back?: { enabled?: boolean; label?: string };
    liveness?: { enabled?: boolean; label?: string };
  };
  completionTitle?: string;
  completionMessage?: string;
  showConfetti?: boolean;
}

const PB_FONT_MAP: Record<string, string> = {
  'dm-sans': '"DM Sans", system-ui, sans-serif',
  'inter': '"Inter", system-ui, sans-serif',
  'system': 'system-ui, -apple-system, sans-serif',
};

const UserVerificationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();

  const sessionParam = searchParams.get('session') || '';
  const apiKey = searchParams.get('api_key') || process.env.REACT_APP_IDSWYFT_API_KEY || '';
  const userId = searchParams.get('user_id') || '';
  const redirectUrl = searchParams.get('redirect_url') || '';
  const theme = (searchParams.get('theme') as 'light' | 'dark') || 'dark';
  const showBackButton = searchParams.get('show_back') !== 'false';
  const addressVerifEnabled = searchParams.get('address_verif') === 'true';
  const verificationMode = (searchParams.get('verification_mode') as 'full' | 'age_only') || undefined;
  const ageThreshold = searchParams.get('age_threshold') ? parseInt(searchParams.get('age_threshold')!, 10) : undefined;

  // Deprecation warning for api_key in URL
  if (apiKey && !sessionParam) {
    console.warn('[Idswyft] Passing api_key in the URL is deprecated. Use session tokens instead. See: https://docs.idswyft.app/session-tokens');
  }

  // Session-based auth state (populated from session-info endpoint)
  const [sessionToken] = useState<string>(sessionParam);
  const [sessionVerificationId, setSessionVerificationId] = useState<string>('');
  const [sessionUserId, setSessionUserId] = useState<string>('');
  const [sessionMode, setSessionMode] = useState<string>('');
  const [sessionAgeThreshold, setSessionAgeThreshold] = useState<number | undefined>(undefined);
  const [sessionReady, setSessionReady] = useState(!sessionParam); // true immediately if no session param
  const [sessionError, setSessionError] = useState<string>('');

  const viewOnly = !sessionParam && (!apiKey || !userId);

  const [phase, setPhase] = useState<Phase>('choice');
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [verificationResult, setVerificationResult] = useState<any>(null);

  // Address verification state
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const [addressDocType, setAddressDocType] = useState<string>('utility_bill');
  const [addressResult, setAddressResult] = useState<any>(null);
  const [addressUploading, setAddressUploading] = useState(false);

  // Page branding — fetched from developer config
  const [branding, setBranding] = useState<PageBranding | null>(null);
  const [pageConfig, setPageConfig] = useState<PageBuilderConfig | null>(null);
  const accentBorder = branding?.accent_color ? `${branding.accent_color}40` : C.cyanBorder;
  const hasCustomBranding = !!(branding?.logo_url || branding?.company_name || branding?.accent_color);

  // Page builder derived values
  const pbFont = pageConfig?.fontFamily ? PB_FONT_MAP[pageConfig.fontFamily] : undefined;
  const pbText = pageConfig?.textColor || undefined;
  const showPoweredBy = pageConfig?.showPoweredBy ?? true;

  useEffect(() => { injectFonts(); }, []);

  // Fetch session info when using session token (replaces api_key-based page-config)
  useEffect(() => {
    if (!sessionParam) return;
    fetch(`${API_BASE_URL}/api/v2/verify/session-info`, {
      headers: { 'X-Session-Token': sessionParam },
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setSessionVerificationId(data.verification_id);
        setSessionUserId(data.user_id);
        setSessionMode(data.verification_mode || 'full');
        if (data.age_threshold != null) setSessionAgeThreshold(data.age_threshold);
        if (data.branding) setBranding(data.branding);
        if (data.page_builder_config) setPageConfig(data.page_builder_config);
        setSessionReady(true);
      })
      .catch((err) => {
        setSessionError(
          err.message?.includes('410')
            ? 'This verification link has expired. Please request a new one.'
            : 'Invalid or expired verification link.'
        );
        setSessionReady(true);
      });
  }, [sessionParam]);

  // Fetch page branding config (supports both api_key and slug-based lookup)
  // Skipped when using session token — session-info already provides branding
  useEffect(() => {
    if (sessionParam) return; // session-info already handled branding
    const url = slug
      ? `${API_BASE_URL}/api/v2/verify/page-config/slug/${encodeURIComponent(slug)}`
      : apiKey
        ? `${API_BASE_URL}/api/v2/verify/page-config?api_key=${encodeURIComponent(apiKey)}`
        : null;
    if (!url) return;
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.branding) setBranding(data.branding);
        if (data?.page_builder_config) setPageConfig(data.page_builder_config);
      })
      .catch(() => {});
  }, [apiKey, slug, sessionParam]);

  // Track viewport width for responsive layout
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Effective values (session data takes precedence) ──────────────
  const effectiveApiKey = sessionParam ? '' : apiKey; // not needed with session token
  const effectiveUserId = sessionParam ? sessionUserId : userId;
  const effectiveMode = (sessionParam ? sessionMode : verificationMode) as 'full' | 'age_only' | undefined;
  const effectiveAgeThreshold = sessionParam ? sessionAgeThreshold : ageThreshold;

  // Don't render until session info is loaded
  if (!sessionReady) {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: C.sans, color: 'var(--mid)', fontSize: '0.9rem' }}>Loading...</div>
      </div>
    );
  }

  // Session token was provided but failed to resolve
  if (sessionParam && sessionError) {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <img src="/idswyft-logo.png" alt="Idswyft" style={{ height: 36, margin: '0 auto 32px' }} />
          <div style={{
            width: 56, height: 56, margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: C.mono, fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
            background: C.redDim, border: `1px solid ${C.red}`, color: C.red,
          }}>
            ERR
          </div>
          <h1 style={{ fontFamily: C.sans, fontSize: '1.3rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 8px' }}>
            Verification Unavailable
          </h1>
          <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: 'var(--mid)', margin: 0 }}>
            {sessionError}
          </p>
        </div>
      </div>
    );
  }

  // ── Handlers ──────────────────────────────────────────────────────
  /** Append verification result params to the redirect URL */
  const buildRedirectUrl = (url: string, result: any) => {
    try {
      const u = new URL(url);
      if (result?.verification_id) u.searchParams.set('verification_id', result.verification_id);
      if (result?.status) u.searchParams.set('status', result.status);
      if (result?.user_id) u.searchParams.set('user_id', result.user_id);
      return u.toString();
    } catch {
      // Fallback for relative or malformed URLs
      const sep = url.includes('?') ? '&' : '?';
      const params = new URLSearchParams();
      if (result?.verification_id) params.set('verification_id', result.verification_id);
      if (result?.status) params.set('status', result.status);
      if (result?.user_id) params.set('user_id', result.user_id);
      return url + sep + params.toString();
    }
  };

  const handleVerificationComplete = (result: any) => {
    // If address verification is enabled, go to address phase instead of finishing
    if (addressVerifEnabled) {
      setVerificationResult(result);
      setPhase('address');
      return;
    }

    if (window.parent !== window) {
      window.parent.postMessage({ type: 'VERIFICATION_COMPLETE', result }, '*');
    } else if (redirectUrl) {
      setTimeout(() => { window.location.href = buildRedirectUrl(redirectUrl, result); }, 1500);
    } else {
      // Not in iframe, no redirect — show completion screen
      setVerificationResult(result);
      setPhase('completed');
    }
  };

  const finishVerification = () => {
    const result = verificationResult;
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'VERIFICATION_COMPLETE',
        result: { ...result, address_verification: addressResult },
      }, '*');
    }
    if (redirectUrl) {
      const fullResult = { ...result, address_verification: addressResult };
      setTimeout(() => { window.location.href = buildRedirectUrl(redirectUrl, fullResult); }, 1500);
    }
  };

  const handleRedirect = (url: string) => {
    setTimeout(() => { window.location.href = url; }, 1500);
  };

  const handleAddressFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) return;
    if (file.size > 10 * 1024 * 1024) return;
    setAddressFile(file);
  };

  const uploadAddressDocument = async () => {
    if (!addressFile || !verificationResult?.verification_id) return;
    setAddressUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', addressFile);
      formData.append('document_type', addressDocType);

      const url = buildApiUrl(`/api/v2/verify/${verificationResult.verification_id}/address-document`);
      if (shouldUseSandbox()) url.searchParams.append('sandbox', 'true');

      const authHeaders: Record<string, string> = sessionToken
        ? { 'X-Session-Token': sessionToken }
        : { 'X-API-Key': apiKey };

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || err.error || 'Upload failed');
      }

      const data = await response.json();
      setAddressResult(data.address_verification);
    } catch (error) {
      console.error('Address upload failed:', error);
    } finally {
      setAddressUploading(false);
    }
  };

  const handleGoBack = () => {
    if (window.history.length > 1) navigate(-1);
    else window.close();
  };

  // ── Back button (dark-themed) ─────────────────────────────────────
  const BackBtn = () =>
    showBackButton ? (
      <div className="absolute top-6 left-6 z-50">
        <button
          onClick={() => phase === 'choice' ? handleGoBack() : setPhase('choice')}
          style={{
            fontFamily: C.mono,
            fontSize: '0.75rem',
            fontWeight: 500,
            letterSpacing: '0.04em',
            color: 'var(--mid)',
            background: 'var(--panel)',
            border: '1px solid var(--rule)',
            padding: '8px 16px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          <ArrowLeftIcon style={{ width: 14, height: 14 }} />
          {phase === 'choice' ? 'Back' : 'Back to options'}
        </button>
      </div>
    ) : null;

  // ── View-only banner ──────────────────────────────────────────────
  const ViewOnlyBanner = () => (
    <div style={{
      background: 'var(--flag-soft)',
      border: '1px solid var(--flag)',
      padding: '12px 18px',
      marginBottom: 24,
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
    }}>
      <span style={{ fontFamily: C.mono, fontSize: '0.7rem', fontWeight: 600, color: 'var(--flag)', flexShrink: 0, marginTop: 2 }}>WARN</span>
      <div>
        <p style={{
          fontFamily: C.sans, fontSize: '0.82rem', fontWeight: 600, color: 'var(--flag)',
          margin: '0 0 4px',
        }}>
          Preview Mode
        </p>
        <p style={{
          fontFamily: C.sans, fontSize: '0.78rem', color: 'var(--mid)',
          margin: '0 0 8px', lineHeight: 1.5,
        }}>
          This page requires a <code style={{ fontFamily: C.mono, fontSize: '0.72rem', color: 'var(--accent-ink)' }}>session</code> token
          (from <code style={{ fontFamily: C.mono, fontSize: '0.72rem', color: 'var(--accent-ink)' }}>POST /api/v2/verify/initialize</code>)
          to start a real verification. You're seeing a read-only preview.
        </p>
        <div style={{
          fontFamily: C.mono, fontSize: '0.68rem', color: 'var(--soft)',
          background: 'var(--paper)', padding: '6px 10px',
          wordBreak: 'break-all',
        }}>
          /user-verification?session=<span style={{ color: 'var(--accent-ink)' }}>session_token_from_initialize</span>
        </div>
      </div>
    </div>
  );

  // ── Phase: mobile-qr ──────────────────────────────────────────────
  if (!viewOnly && phase === 'mobile-qr') {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <BackBtn />
        <div style={{ maxWidth: 440, width: '100%' }}>
          <ContinueOnPhone
            apiKey={effectiveApiKey}
            userId={effectiveUserId}
            sessionToken={sessionToken || undefined}
            verificationMode={effectiveMode}
            ageThreshold={effectiveAgeThreshold}
            onComplete={(result) => {
              handleVerificationComplete({
                verification_id: result.verification_id ?? 'mobile-handoff',
                user_id: result.user_id ?? userId,
                status: result.status ?? 'manual_review',
                confidence_score: result.confidence_score,
                face_match_score: result.face_match_score,
                liveness_score: result.liveness_score,
              });
            }}
          />
        </div>
      </div>
    );
  }

  // ── Phase: desktop ────────────────────────────────────────────────
  if (!viewOnly && phase === 'desktop') {
    return (
      <div className="relative min-h-screen">
        <BackBtn />
        <EndUserVerification
          apiKey={effectiveApiKey}
          userId={effectiveUserId}
          sessionToken={sessionToken || undefined}
          sessionVerificationId={sessionVerificationId || undefined}
          redirectUrl={redirectUrl}
          theme={theme}
          onComplete={handleVerificationComplete}
          onRedirect={handleRedirect}
          allowedDocumentTypes={['passport', 'drivers_license', 'national_id']}
          verificationMode={effectiveMode}
          ageThreshold={effectiveAgeThreshold}
          branding={branding ?? undefined}
        />
      </div>
    );
  }

  // ── Phase: completed — terminal state when no redirect/iframe ───────
  if (!viewOnly && phase === 'completed') {
    const statusLabel = verificationResult?.status === 'verified' || verificationResult?.status === 'completed'
      ? 'Verified' : verificationResult?.status === 'failed' ? 'Failed' : 'Under Review';
    const isSuccess = statusLabel === 'Verified';
    const isFailed = statusLabel === 'Failed';
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
          {branding?.logo_url ? (
            <img src={branding.logo_url} alt={branding.company_name || 'Logo'} style={{ height: 36, margin: '0 auto 32px', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <img src="/idswyft-logo.png" alt="Idswyft" style={{ height: 36, margin: '0 auto 32px' }} />
          )}
          <div className={isSuccess ? 'result-badge badge-success' : isFailed ? 'result-badge badge-error' : 'result-badge badge-warning'} style={{
            margin: '0 auto 16px', display: 'inline-flex', padding: '8px 16px',
            fontFamily: C.mono, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            {isSuccess ? 'PASS' : isFailed ? 'FAIL' : 'REVIEW'}
          </div>
          <h1 style={{ fontFamily: C.sans, fontSize: '1.4rem', fontWeight: 600, color: 'var(--ink)', margin: '16px 0 8px' }}>
            {verificationMode === 'age_only'
              ? isSuccess ? 'Age Verified' : 'Age Verification Failed'
              : `Verification ${statusLabel}`}
          </h1>
          <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: 'var(--mid)', margin: '0 0 24px' }}>
            {verificationMode === 'age_only'
              ? isSuccess
                ? `You meet the minimum age requirement of ${ageThreshold ?? 18}.`
                : 'Age verification could not be completed.'
              : isSuccess
              ? 'Your identity has been successfully verified.'
              : statusLabel === 'Failed'
                ? 'Verification could not be completed. Please try again.'
                : 'Your verification is being reviewed. You will be notified of the result.'}
          </p>
          {verificationResult && (
            <div className="result-grid" style={{ textAlign: 'left' }}>
              {verificationResult.confidence_score != null && (
                <>
                  <div>Confidence</div>
                  <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round(verificationResult.confidence_score * 100)}%</div>
                </>
              )}
              {verificationResult.face_match_score != null && (
                <>
                  <div>Face Match</div>
                  <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round(verificationResult.face_match_score * 100)}%</div>
                </>
              )}
              {verificationResult.liveness_score != null && (
                <>
                  <div>Liveness</div>
                  <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round(verificationResult.liveness_score * 100)}%</div>
                </>
              )}
            </div>
          )}
          <p style={{ fontFamily: C.mono, fontSize: '0.72rem', color: 'var(--soft)', marginTop: 24, letterSpacing: '0.04em' }}>
            You can close this window.
          </p>
          {hasCustomBranding && showPoweredBy && (
            <p style={{ fontFamily: C.mono, fontSize: '0.68rem', color: 'var(--soft)', marginTop: 12, letterSpacing: '0.04em' }}>
              Powered by Idswyft
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Phase: address — optional proof-of-address after identity ─────
  if (!viewOnly && phase === 'address') {
    return (
      <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ maxWidth: 480, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <img src="/idswyft-logo.png" alt="Idswyft" style={{ height: 36, margin: '0 auto 24px' }} />
            <div className="badge-success" style={{
              margin: '0 auto 16px', display: 'inline-flex', padding: '6px 14px',
              fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              PASS
            </div>
            <h1 style={{ fontFamily: C.sans, fontSize: '1.4rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 6px' }}>
              Identity Verified
            </h1>
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: 'var(--mid)', margin: '0 0 24px' }}>
              Now upload a proof-of-address document to complete your verification.
            </p>
          </div>

          {!addressResult ? (
            <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">
                  Document Type
                </label>
                <select
                  value={addressDocType}
                  onChange={(e) => setAddressDocType(e.target.value)}
                  className="form-input"
                >
                  <option value="utility_bill">Utility Bill</option>
                  <option value="bank_statement">Bank Statement</option>
                  <option value="tax_document">Tax Document</option>
                </select>
              </div>

              <label htmlFor="address-upload" className="file-upload-zone" style={{ display: 'block' }}>
                <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={handleAddressFileSelect} style={{ display: 'none' }} id="address-upload" />
                <p style={{ fontFamily: C.sans, fontSize: '0.85rem', color: 'var(--mid)', margin: '0 0 4px' }}>
                  {addressFile ? addressFile.name : 'Click to upload or drag and drop'}
                </p>
                <p style={{ fontFamily: C.mono, fontSize: '0.72rem', color: 'var(--soft)', margin: 0 }}>
                  {addressFile ? `${(addressFile.size / 1024 / 1024).toFixed(2)} MB` : 'JPEG, PNG, or PDF (max 10MB)'}
                </p>
              </label>

              <button
                onClick={uploadAddressDocument}
                disabled={!addressFile || addressUploading}
                className={!addressFile || addressUploading ? 'btn' : 'btn-accent'}
                style={{
                  width: '100%', padding: '12px 0', justifyContent: 'center',
                  cursor: !addressFile || addressUploading ? 'not-allowed' : 'pointer',
                }}
              >
                {addressUploading ? 'Processing...' : 'Verify Address'}
              </button>

              <button
                onClick={finishVerification}
                className="btn-outline"
                style={{
                  width: '100%', padding: '10px 0', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                Skip -- I'll do this later
              </button>
            </div>
          ) : (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <div className={addressResult.status === 'verified' ? 'badge-success' : 'badge-warning'} style={{
                margin: '0 auto 12px', display: 'inline-flex', padding: '6px 14px',
                fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                {addressResult.status === 'verified' ? 'PASS' : 'REVIEW'}
              </div>
              <h3 style={{ fontFamily: C.sans, fontSize: '1.1rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 8px' }}>
                Address {addressResult.status === 'verified' ? 'Verified' : 'Under Review'}
              </h3>
              <div className="result-grid" style={{ textAlign: 'left', marginBottom: 20 }}>
                <div>Score</div>
                <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round((addressResult.score || 0) * 100)}%</div>
                <div>Name Match</div>
                <div style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round((addressResult.name_match_score || 0) * 100)}%</div>
                {addressResult.address && (
                  <>
                    <div>Address</div>
                    <div style={{ color: 'var(--ink)' }}>{addressResult.address}</div>
                  </>
                )}
              </div>
              <button
                onClick={finishVerification}
                className="btn-accent"
                style={{ width: '100%', padding: '12px 0', justifyContent: 'center', cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Phase: choice (default) — also shown in view-only mode ────────
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <BackBtn />
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {branding?.logo_url ? (
            <img src={branding.logo_url} alt={branding.company_name || 'Logo'} style={{ height: 36, margin: '0 auto', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <img src="/idswyft-logo.png" alt="Idswyft" style={{ height: 36, margin: '0 auto' }} />
          )}
        </div>

        {/* View-only warning */}
        {viewOnly && <ViewOnlyBanner />}

        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontFamily: pbFont || C.sans, fontSize: '1.6rem', fontWeight: 600, color: pbText || 'var(--ink)', margin: '0 0 8px' }}>
            {verificationMode === 'age_only'
              ? 'Verify Your Age'
              : pageConfig?.headerTitle
                ? pageConfig.headerTitle
                : branding?.company_name
                  ? `Verify with ${branding.company_name}`
                  : 'Verify Your Identity'}
          </h1>
          <p style={{ fontFamily: pbFont || C.sans, fontSize: '0.92rem', color: 'var(--mid)', margin: 0 }}>
            {verificationMode === 'age_only'
              ? `Upload your ID to confirm you are ${ageThreshold ?? 18}+`
              : pageConfig?.headerSubtitle || 'Choose how you\'d like to complete verification'}
          </p>
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          {/* ── Mobile card (recommended) ── */}
          <div className="card" style={{
            border: `1px solid ${accentBorder}`,
            padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
            opacity: viewOnly ? 0.6 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge-success" style={{
                fontFamily: C.mono, fontSize: '0.6rem', fontWeight: 600,
                letterSpacing: '0.08em', padding: '2px 8px',
              }}>
                RECOMMENDED
              </span>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: '0.8rem', color: 'var(--mid)', letterSpacing: '0.04em' }}>MOBILE</div>
            <div>
              <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 6px' }}>
                Continue on Your Phone
              </h3>
              <ul className="checklist">
                {['Better camera quality', 'Guided capture experience', 'Higher success rate'].map(b => (
                  <li key={b} className="ok" style={{ fontSize: '0.78rem', borderBottom: 'none', padding: '2px 0' }}>
                    <span className="dot">--</span> <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => !viewOnly && setPhase('mobile-qr')}
              disabled={viewOnly}
              className={viewOnly ? 'btn' : 'btn-accent'}
              style={{
                marginTop: 'auto', width: '100%', padding: '12px 0', justifyContent: 'center',
                cursor: viewOnly ? 'not-allowed' : 'pointer',
              }}
            >
              Scan QR Code
            </button>
          </div>

          {/* ── Desktop card (secondary) -- hidden on mobile ── */}
          {!isMobile && (
            <div className="card" style={{
              padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
              opacity: viewOnly ? 0.6 : 1,
            }}>
              <div style={{ height: 20 }} /> {/* spacer to align with RECOMMENDED pill */}
              <div style={{ fontFamily: C.mono, fontSize: '0.8rem', color: 'var(--mid)', letterSpacing: '0.04em' }}>DESKTOP</div>
              <div>
                <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 6px' }}>
                  Use This Device
                </h3>
                <p style={{ fontFamily: C.sans, fontSize: '0.78rem', color: 'var(--mid)', margin: 0, lineHeight: 1.55 }}>
                  Upload photos and use your webcam to complete verification on this computer.
                </p>
              </div>
              <button
                onClick={() => !viewOnly && setPhase('desktop')}
                disabled={viewOnly}
                className="btn-outline"
                style={{
                  marginTop: 'auto', width: '100%', padding: '12px 0', justifyContent: 'center',
                  cursor: viewOnly ? 'not-allowed' : 'pointer',
                }}
              >
                Continue on Desktop
              </button>
            </div>
          )}
        </div>

        {hasCustomBranding && showPoweredBy && (
          <p style={{ fontFamily: C.mono, fontSize: '0.68rem', color: 'var(--soft)', textAlign: 'center', marginTop: 20, letterSpacing: '0.04em' }}>
            Powered by Idswyft
          </p>
        )}
      </div>
    </div>
  );
};

export default UserVerificationPage;
