import { ServiceCard } from './ServiceCard';
import type { DayStatus, UptimeDayData } from './UptimeBar';
import type { ServiceStatus, DailySummary } from '../services/api';

interface Props {
  services: ServiceStatus[];
  history: DailySummary[];
}

function buildServiceUptime(serviceId: string, history: DailySummary[], days: number = 30): UptimeDayData[] {
  const dayMap = new Map<string, DayStatus>();
  for (const row of history) {
    if (row.service !== serviceId) continue;
    let status: DayStatus = 'operational';
    if (row.down_count > 0) status = 'down';
    else if (row.degraded > 0) status = 'degraded';
    dayMap.set(row.day, status);
  }
  const result: UptimeDayData[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ day: key, status: dayMap.get(key) ?? 'no-data' });
  }
  return result;
}

function calcUptimePercent(data: UptimeDayData[]): string | null {
  const withData = data.filter((d) => d.status !== 'no-data');
  if (withData.length === 0) return null;
  const op = withData.filter((d) => d.status === 'operational').length;
  return ((op / withData.length) * 100).toFixed(2);
}

export function ServiceGrid({ services, history }: Props) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: 12,
    }}>
      {services.map((svc) => {
        const uptimeData = buildServiceUptime(svc.id, history);
        const uptimePercent = calcUptimePercent(uptimeData);
        return (
          <ServiceCard key={svc.id} service={svc} uptimeData={uptimeData} uptimePercent={uptimePercent} />
        );
      })}
    </div>
  );
}
