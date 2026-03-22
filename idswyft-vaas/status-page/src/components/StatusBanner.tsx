import { statusColors, bannerLabels } from '../theme';

interface Props {
  status: 'operational' | 'degraded' | 'down';
  refreshing?: boolean;
}

export function StatusBanner({ status, refreshing }: Props) {
  const colors = statusColors[status];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '16px 20px', borderRadius: 12,
      background: colors.bg, border: `1px solid ${colors.border}`,
    }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: colors.dot, flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>
        {bannerLabels[status]}
      </span>
      {refreshing && (
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>updating...</span>
      )}
    </div>
  );
}
