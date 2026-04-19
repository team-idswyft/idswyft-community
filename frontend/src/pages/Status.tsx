import { useEffect } from 'react';

const getStatusUrl = () => {
  if (window.location.hostname.endsWith('.idswyft.app') || window.location.hostname === 'idswyft.app') {
    return 'https://status.idswyft.app';
  }
  return 'http://localhost:5174';
};

export function Status() {
  useEffect(() => {
    window.location.replace(getStatusUrl());
  }, []);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)' }}>
      <p style={{ color: 'var(--mid)', fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '0.04em' }}>Redirecting to status page...</p>
    </div>
  );
}
