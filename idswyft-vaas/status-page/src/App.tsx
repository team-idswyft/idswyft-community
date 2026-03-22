import { useEffect, useState } from 'react';
import { StatusPage } from './pages/StatusPage';

const VAAS_API = import.meta.env.VITE_VAAS_API_URL || 'http://localhost:3002/api';

/** Fetch logo + favicon from platform assets bucket (same pattern as platform-admin) */
function usePlatformBranding() {
  const [logoUrl, setLogoUrl] = useState('/idswyft-logo.png');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${VAAS_API}/assets/platform`);
        const payload = await res.json();
        const logo = payload?.data?.logo_url;
        const favicon = payload?.data?.favicon_url;

        if (res.ok && typeof logo === 'string' && logo.trim()) {
          setLogoUrl(logo);
        }
        if (res.ok && typeof favicon === 'string' && favicon.trim()) {
          const link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
          if (link) link.href = favicon;
        }
      } catch {
        // Keep static fallbacks
      }
    };
    load();
  }, []);

  return logoUrl;
}

export default function App() {
  const logoUrl = usePlatformBranding();
  return <StatusPage logoUrl={logoUrl} />;
}
