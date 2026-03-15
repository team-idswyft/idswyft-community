import React, { useEffect, useState, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import VerificationFlow from './components/VerificationFlow';
import VerificationStatus from './components/VerificationStatus';
import ErrorBoundary from './components/ErrorBoundary';
import { OrganizationProvider } from './contexts/OrganizationContext';
import './index.css';

// ─── Embed Mode Helpers ─────────────────────────────────

/** Check if we're running inside an iframe with embed=true */
function useEmbedMode() {
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';
  const theme = searchParams.get('theme') || 'dark';
  const isIframe = window !== window.parent;

  const postToParent = useCallback((type: string, payload: any) => {
    if (isEmbed && isIframe) {
      window.parent.postMessage(
        { source: 'idswyft-embed', type, payload },
        '*'
      );
    }
  }, [isEmbed, isIframe]);

  // Notify parent that iframe is ready
  useEffect(() => {
    if (isEmbed && isIframe) {
      postToParent('ready', {});
    }
  }, [isEmbed, isIframe, postToParent]);

  return { isEmbed, theme, postToParent };
}

// ─── Verification Pages ─────────────────────────────────

function VerificationPage() {
  const [searchParams] = useSearchParams();
  const sessionToken = searchParams.get('session');
  const { isEmbed, postToParent } = useEmbedMode();
  const { t } = useTranslation();

  if (!sessionToken) {
    if (isEmbed) {
      postToParent('error', { code: 'INVALID_SESSION', message: 'No session token provided' });
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('app.invalidLink')}</h1>
          <p className="text-gray-600">{t('app.invalidLinkMessage')}</p>
        </div>
      </div>
    );
  }

  return (
    <VerificationFlow
      sessionToken={sessionToken}
      embedMode={isEmbed}
      onEmbedComplete={(result) => postToParent('complete', result)}
      onEmbedError={(error) => postToParent('error', error)}
      onEmbedStepChange={(step) => postToParent('step_change', step)}
    />
  );
}

function VerificationPageWithToken() {
  const { token } = useParams<{ token: string }>();
  const { isEmbed, postToParent } = useEmbedMode();
  const { t } = useTranslation();

  if (!token) {
    if (isEmbed) {
      postToParent('error', { code: 'INVALID_TOKEN', message: 'No token in URL path' });
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('app.invalidLink')}</h1>
          <p className="text-gray-600">{t('app.invalidLinkMessage')}</p>
        </div>
      </div>
    );
  }

  return (
    <VerificationFlow
      sessionToken={token}
      embedMode={isEmbed}
      onEmbedComplete={(result) => postToParent('complete', result)}
      onEmbedError={(error) => postToParent('error', error)}
      onEmbedStepChange={(step) => postToParent('step_change', step)}
    />
  );
}

function StatusPage() {
  const [searchParams] = useSearchParams();
  const sessionToken = searchParams.get('session');
  const { t } = useTranslation();

  if (!sessionToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('app.invalidStatusLink')}</h1>
          <p className="text-gray-600">{t('app.invalidStatusMessage')}</p>
        </div>
      </div>
    );
  }

  return <VerificationStatus sessionToken={sessionToken} />;
}

function FallbackPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">{t('app.portalTitle')}</h1>
        <p className="text-gray-600 mb-6">{t('app.portalMessage')}</p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>{t('app.needHelp')}</strong> {t('app.needHelpMessage')}
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <OrganizationProvider>
        <Router>
          <div className="App">
            <Routes>
              {/* Main verification flow - supports both query params and path params */}
              <Route path="/verify" element={<VerificationPage />} />
              <Route path="/verify/:token" element={<VerificationPageWithToken />} />

              {/* Verification status page */}
              <Route path="/status" element={<StatusPage />} />

              {/* Default/fallback route */}
              <Route path="*" element={<FallbackPage />} />
            </Routes>
          </div>
        </Router>
      </OrganizationProvider>
    </ErrorBoundary>
  );
}

export default App;
