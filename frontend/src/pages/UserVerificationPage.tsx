import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import EndUserVerification from '../components/verification/EndUserVerification';
import { ContinueOnPhone } from '../components/ContinueOnPhone';
import { C, injectFonts } from '../theme';
import { API_BASE_URL, shouldUseSandbox } from '../config/api';

// ─── State machine ─────────────────────────────────────────────────
// 'choice'     → user picks mobile or desktop
// 'mobile-qr'  → ContinueOnPhone in full-page dark wrapper
// 'desktop'    → EndUserVerification with dark theme
// 'address'    → optional address verification (when address_verif=true)
// ────────────────────────────────────────────────────────────────────
type Phase = 'choice' | 'mobile-qr' | 'desktop' | 'address';

const UserVerificationPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const apiKey = searchParams.get('api_key') || process.env.REACT_APP_IDSWYFT_API_KEY || '';
  const userId = searchParams.get('user_id') || '';
  const redirectUrl = searchParams.get('redirect_url') || '';
  const theme = (searchParams.get('theme') as 'light' | 'dark') || 'dark';
  const showBackButton = searchParams.get('show_back') !== 'false';
  const addressVerifEnabled = searchParams.get('address_verif') === 'true';

  const viewOnly = !apiKey || !userId;

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

  useEffect(() => { injectFonts(); }, []);

  // Track viewport width for responsive layout
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleVerificationComplete = (result: any) => {
    // If address verification is enabled, go to address phase instead of finishing
    if (addressVerifEnabled) {
      setVerificationResult(result);
      setPhase('address');
      return;
    }

    if (window.parent !== window) {
      window.parent.postMessage({ type: 'VERIFICATION_COMPLETE', result }, '*');
    }
    if (redirectUrl) {
      setTimeout(() => { window.location.href = redirectUrl; }, 1500);
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
      setTimeout(() => { window.location.href = redirectUrl; }, 1500);
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

      const url = new URL(`${API_BASE_URL}/api/v2/verify/${verificationResult.verification_id}/address-document`);
      if (shouldUseSandbox()) url.searchParams.append('sandbox', 'true');

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
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
            fontFamily: C.sans,
            fontSize: '0.82rem',
            fontWeight: 500,
            color: C.muted,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
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
      background: C.amberDim,
      border: `1px solid ${C.amber}35`,
      borderRadius: 10,
      padding: '12px 18px',
      marginBottom: 24,
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
    }}>
      <span style={{ color: C.amber, fontSize: '1rem', flexShrink: 0, marginTop: 1 }}>⚠</span>
      <div>
        <p style={{
          fontFamily: C.sans, fontSize: '0.82rem', fontWeight: 600, color: C.amber,
          margin: '0 0 4px',
        }}>
          Preview Mode
        </p>
        <p style={{
          fontFamily: C.sans, fontSize: '0.78rem', color: C.muted,
          margin: '0 0 8px', lineHeight: 1.5,
        }}>
          This page requires <code style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.cyan }}>api_key</code> and{' '}
          <code style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.cyan }}>user_id</code> URL
          parameters to start a real verification. You're seeing a read-only preview.
        </p>
        <div style={{
          fontFamily: C.mono, fontSize: '0.68rem', color: C.dim,
          background: C.bg, borderRadius: 6, padding: '6px 10px',
          wordBreak: 'break-all',
        }}>
          /user-verification?api_key=<span style={{ color: C.cyan }}>sk_live_xxx</span>&user_id=<span style={{ color: C.cyan }}>user-uuid</span>
        </div>
      </div>
    </div>
  );

  // ── Phase: mobile-qr ──────────────────────────────────────────────
  if (!viewOnly && phase === 'mobile-qr') {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <BackBtn />
        <div style={{ maxWidth: 440, width: '100%' }}>
          <ContinueOnPhone
            apiKey={apiKey}
            userId={userId}
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
          apiKey={apiKey}
          userId={userId}
          redirectUrl={redirectUrl}
          theme={theme}
          onComplete={handleVerificationComplete}
          onRedirect={handleRedirect}
          allowedDocumentTypes={['passport', 'drivers_license', 'national_id']}
        />
      </div>
    );
  }

  // ── Phase: address — optional proof-of-address after identity ─────
  if (!viewOnly && phase === 'address') {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ maxWidth: 480, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <img src="/idswyft-logo.png" alt="Idswyft" style={{ height: 36, margin: '0 auto 24px' }} />
            <div style={{
              width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: C.greenDim, border: `1px solid ${C.green}`, color: C.green, fontSize: 20,
            }}>
              ✓
            </div>
            <h1 style={{ fontFamily: C.sans, fontSize: '1.4rem', fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
              Identity Verified
            </h1>
            <p style={{ fontFamily: C.sans, fontSize: '0.88rem', color: C.muted, margin: '0 0 24px' }}>
              Now upload a proof-of-address document to complete your verification.
            </p>
          </div>

          {!addressResult ? (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <div>
                <label style={{ display: 'block', fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, marginBottom: 6, fontWeight: 500 }}>
                  Document Type
                </label>
                <select
                  value={addressDocType}
                  onChange={(e) => setAddressDocType(e.target.value)}
                  style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '10px 14px', width: '100%', fontSize: '0.88rem', fontFamily: C.sans, outline: 'none' }}
                >
                  <option value="utility_bill">Utility Bill</option>
                  <option value="bank_statement">Bank Statement</option>
                  <option value="tax_document">Tax Document</option>
                </select>
              </div>

              <label htmlFor="address-upload" style={{
                display: 'block', border: `2px dashed ${C.border}`, borderRadius: 10,
                padding: '28px 16px', textAlign: 'center', cursor: 'pointer',
              }}>
                <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={handleAddressFileSelect} style={{ display: 'none' }} id="address-upload" />
                <p style={{ fontFamily: C.sans, fontSize: '0.85rem', color: C.muted, margin: '0 0 4px' }}>
                  {addressFile ? addressFile.name : 'Click to upload or drag and drop'}
                </p>
                <p style={{ fontFamily: C.sans, fontSize: '0.72rem', color: C.dim, margin: 0 }}>
                  {addressFile ? `${(addressFile.size / 1024 / 1024).toFixed(2)} MB` : 'JPEG, PNG, or PDF (max 10MB)'}
                </p>
              </label>

              <button
                onClick={uploadAddressDocument}
                disabled={!addressFile || addressUploading}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
                  background: !addressFile || addressUploading ? C.dim : C.cyan,
                  color: !addressFile || addressUploading ? C.muted : '#080c14',
                  fontFamily: C.sans, fontSize: '0.88rem', fontWeight: 600,
                  cursor: !addressFile || addressUploading ? 'not-allowed' : 'pointer',
                }}
              >
                {addressUploading ? 'Processing...' : 'Verify Address'}
              </button>

              <button
                onClick={finishVerification}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10,
                  background: 'transparent', color: C.muted,
                  border: `1px solid ${C.border}`,
                  fontFamily: C.sans, fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer',
                }}
              >
                Skip — I'll do this later
              </button>
            </div>
          ) : (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: 24, textAlign: 'center',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                background: addressResult.status === 'verified' ? C.greenDim : C.amberDim,
                border: `1px solid ${addressResult.status === 'verified' ? C.green : C.amber}`,
                color: addressResult.status === 'verified' ? C.green : C.amber,
              }}>
                {addressResult.status === 'verified' ? '✓' : '⚠'}
              </div>
              <h3 style={{ fontFamily: C.sans, fontSize: '1.1rem', fontWeight: 600, color: C.text, margin: '0 0 8px' }}>
                Address {addressResult.status === 'verified' ? 'Verified' : 'Under Review'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', marginBottom: 20, fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: C.muted }}>Score</span>
                  <span style={{ color: C.text, fontWeight: 600 }}>{Math.round((addressResult.score || 0) * 100)}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: C.muted }}>Name Match</span>
                  <span style={{ color: C.text, fontWeight: 600 }}>{Math.round((addressResult.name_match_score || 0) * 100)}%</span>
                </div>
                {addressResult.address && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: C.muted }}>Address</span>
                    <span style={{ color: C.text, textAlign: 'right', maxWidth: 200 }}>{addressResult.address}</span>
                  </div>
                )}
              </div>
              <button
                onClick={finishVerification}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
                  background: C.cyan, color: '#080c14',
                  fontFamily: C.sans, fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
                }}
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
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <BackBtn />
      <div style={{ maxWidth: 560, width: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/idswyft-logo.png"
            alt="Idswyft"
            style={{ height: 36, margin: '0 auto' }}
          />
        </div>

        {/* View-only warning */}
        {viewOnly && <ViewOnlyBanner />}

        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontFamily: C.sans, fontSize: '1.6rem', fontWeight: 600, color: C.text, margin: '0 0 8px' }}>
            Verify Your Identity
          </h1>
          <p style={{ fontFamily: C.sans, fontSize: '0.92rem', color: C.muted, margin: 0 }}>
            Choose how you'd like to complete verification
          </p>
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          {/* ── Mobile card (recommended) ── */}
          <div style={{
            background: C.surface, border: `1.5px solid ${C.cyanBorder}`,
            borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
            opacity: viewOnly ? 0.6 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: C.mono, fontSize: '0.6rem', fontWeight: 600,
                letterSpacing: '0.08em', padding: '2px 8px', borderRadius: 4,
                background: C.cyanDim, color: C.cyan, border: `1px solid ${C.cyanBorder}`,
              }}>
                RECOMMENDED
              </span>
            </div>
            <div style={{ fontSize: '2rem' }}>📱</div>
            <div>
              <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
                Continue on Your Phone
              </h3>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {['Better camera quality', 'Guided capture experience', 'Higher success rate'].map(b => (
                  <li key={b} style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: C.green, fontSize: '0.65rem' }}>✓</span> {b}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => !viewOnly && setPhase('mobile-qr')}
              disabled={viewOnly}
              style={{
                marginTop: 'auto', width: '100%', padding: '12px 0',
                background: viewOnly ? C.dim : C.cyan,
                color: viewOnly ? C.muted : '#080c14',
                fontFamily: C.sans, fontSize: '0.88rem', fontWeight: 600,
                border: 'none', borderRadius: 10,
                cursor: viewOnly ? 'not-allowed' : 'pointer',
              }}
            >
              Scan QR Code
            </button>
          </div>

          {/* ── Desktop card (secondary) — hidden on mobile ── */}
          {!isMobile && (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14,
              opacity: viewOnly ? 0.6 : 1,
            }}>
              <div style={{ height: 20 }} /> {/* spacer to align with RECOMMENDED pill */}
              <div style={{ fontSize: '2rem' }}>💻</div>
              <div>
                <h3 style={{ fontFamily: C.sans, fontSize: '1rem', fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
                  Use This Device
                </h3>
                <p style={{ fontFamily: C.sans, fontSize: '0.78rem', color: C.muted, margin: 0, lineHeight: 1.55 }}>
                  Upload photos and use your webcam to complete verification on this computer.
                </p>
              </div>
              <button
                onClick={() => !viewOnly && setPhase('desktop')}
                disabled={viewOnly}
                style={{
                  marginTop: 'auto', width: '100%', padding: '12px 0',
                  background: 'transparent',
                  color: viewOnly ? C.dim : C.text,
                  fontFamily: C.sans, fontSize: '0.88rem', fontWeight: 600,
                  border: `1px solid ${viewOnly ? C.border : C.borderStrong}`,
                  borderRadius: 10,
                  cursor: viewOnly ? 'not-allowed' : 'pointer',
                }}
              >
                Continue on Desktop
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserVerificationPage;
