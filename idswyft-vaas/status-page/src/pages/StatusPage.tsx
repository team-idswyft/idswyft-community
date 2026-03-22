import { useEffect, useState, useCallback } from 'react';
import { theme } from '../theme';
import { statusApi } from '../services/api';
import type { StatusResponse, DailySummary, Incident } from '../services/api';
import { StatusBanner } from '../components/StatusBanner';
import { ServiceGrid } from '../components/ServiceGrid';
import { IncidentList } from '../components/IncidentList';

export function StatusPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [history, setHistory] = useState<DailySummary[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await statusApi.getStatus();
      setStatus(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      if (!isRefresh) setError(err instanceof Error ? err.message : 'Unknown error');
    }
    if (isRefresh) setRefreshing(false);
  }, []);

  const fetchIncidents = useCallback(async () => {
    try {
      const data = await statusApi.getIncidents();
      setIncidents(data);
    } catch {
      /* silent on refresh */
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        fetchStatus(),
        fetchIncidents(),
        statusApi.getHistory().then(setHistory).catch(() => {}),
      ]);
      setLoading(false);
    };
    init();

    const statusInterval = setInterval(() => fetchStatus(true), 60000);
    const incidentInterval = setInterval(fetchIncidents, 120000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(incidentInterval);
    };
  }, [fetchStatus, fetchIncidents]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: theme.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: theme.sans,
      }}>
        <p style={{ color: theme.muted, fontSize: 14 }}>Loading status...</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: theme.bg,
      fontFamily: theme.sans, color: theme.text,
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontSize: 11, color: theme.muted, letterSpacing: '0.12em',
            textTransform: 'uppercase', fontFamily: theme.mono,
          }}>
            Idswyft Status
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: theme.text, margin: '8px 0 0' }}>
            System Status
          </h1>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 20,
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            fontSize: 13, color: theme.red,
          }}>
            Unable to fetch status: {error}
          </div>
        )}

        {/* Banner */}
        {status && (
          <div style={{ marginBottom: 24 }}>
            <StatusBanner status={status.overall} refreshing={refreshing} />
          </div>
        )}

        {/* Service Grid */}
        {status && (
          <div style={{ marginBottom: 40 }}>
            <ServiceGrid services={status.services} history={history} />
          </div>
        )}

        {/* Incidents */}
        <IncidentList incidents={incidents} />

        {/* Footer */}
        <div style={{
          marginTop: 48, paddingTop: 24,
          borderTop: `1px solid ${theme.border}`,
          display: 'flex', justifyContent: 'space-between',
          fontSize: 12, color: theme.muted,
        }}>
          <span>Powered by <a href="https://idswyft.app" style={{ color: theme.cyan, textDecoration: 'none' }}>Idswyft</a></span>
          {lastUpdated && (
            <span style={{ fontFamily: theme.mono }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
