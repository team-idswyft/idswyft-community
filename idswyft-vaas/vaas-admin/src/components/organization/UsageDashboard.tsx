import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/api';
import { UsageStats } from '../../types.js';
import { sectionLabel, statNumber, monoXs, monoSm, cardSurface, infoPanel, getStatusAccent } from '../../styles/tokens';

interface UsageDashboardProps {
  organizationId: string;
}

export default function UsageDashboard({ organizationId }: UsageDashboardProps) {
  const { organization } = useAuth();
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsageStats();
  }, [organizationId]);

  const loadUsageStats = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const stats = await apiClient.getOrganizationUsage(organizationId);
      setUsageStats(stats);
    } catch (err: any) {
      setError(err.message || 'Failed to load usage statistics');
      // Mock data for development
      setUsageStats({
        current_period: {
          verification_count: 245,
          api_calls: 1250,
          storage_used_mb: 125.5
        },
        monthly_limit: 1000,
        overage_cost_per_verification: 0.15
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`${cardSurface} p-6`}>
        <div className="animate-pulse">
          <div className="h-4 bg-slate-700/50 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`${cardSurface} p-5 animate-pulse`}>
                <div className="h-3 bg-slate-700/50 rounded w-1/2 mb-3"></div>
                <div className="h-6 bg-slate-700/50 rounded w-2/3 mb-2"></div>
                <div className="h-3 bg-slate-700/50 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !usageStats) {
    return (
      <div className={`${cardSurface} p-6`}>
        <div className="text-center">
          <p className={`${sectionLabel} text-slate-400 mb-2`}>Error</p>
          <h3 className="mt-2 text-sm font-medium text-slate-100">Unable to load usage stats</h3>
          <p className={`${monoXs} text-slate-500 mt-1`}>{error}</p>
          <button
            onClick={loadUsageStats}
            className="mt-3 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-cyan-600 hover:bg-cyan-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const usagePercentage = Math.min((usageStats.current_period.verification_count / usageStats.monthly_limit) * 100, 100);
  const isOverLimit = usageStats.current_period.verification_count > usageStats.monthly_limit;
  const overageCount = Math.max(0, usageStats.current_period.verification_count - usageStats.monthly_limit);
  const overageCost = overageCount * usageStats.overage_cost_per_verification;

  return (
    <div className="space-y-6">
      <div className={cardSurface}>
        <div className="px-6 py-4 border-b border-white/10">
          <p className={sectionLabel}>Current Usage</p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <UsageCard
              title="Verifications"
              value={usageStats.current_period.verification_count.toLocaleString()}
              subtitle={`of ${usageStats.monthly_limit.toLocaleString()} monthly limit`}
              percentage={usagePercentage}
              isWarning={usagePercentage > 80}
              isError={isOverLimit}
            />

            <UsageCard
              title="API Calls"
              value={usageStats.current_period.api_calls.toLocaleString()}
              subtitle="This month"
            />

            <UsageCard
              title="Storage Used"
              value={`${usageStats.current_period.storage_used_mb.toFixed(1)} MB`}
              subtitle="Document storage"
            />
          </div>

          {/* Usage Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span className={`${monoXs} text-slate-500`}>Monthly Verification Usage</span>
              <span className={`${monoSm} text-slate-300`}>{usageStats.current_period.verification_count} / {usageStats.monthly_limit}</span>
            </div>
            <div className="w-full bg-slate-700/50 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  isOverLimit
                    ? 'bg-red-500'
                    : usagePercentage > 80
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              />
            </div>
            {isOverLimit && (
              <p className={`${monoXs} text-rose-400 mt-2`}>
                You have exceeded your monthly limit by {overageCount.toLocaleString()} verifications.
              </p>
            )}
          </div>

          {/* Overage Information */}
          {isOverLimit && (
            <div className={`${cardSurface} border-l-[3px] ${getStatusAccent('error').border} p-4`}>
              <div>
                <p className={sectionLabel}>
                  Overage Charges Apply
                </p>
                <div className="mt-2">
                  <p className={`${monoXs} text-slate-500`}>
                    Additional {overageCount.toLocaleString()} verifications at ${usageStats.overage_cost_per_verification} each.
                  </p>
                  <p className={`${monoSm} text-rose-300 font-semibold mt-1`}>
                    Estimated overage cost: ${overageCost.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Plan Information */}
          <div className={`${infoPanel} mt-4`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={sectionLabel}>Plan</p>
                <p className="text-sm font-medium text-slate-100 capitalize mt-1">
                  {organization?.subscription_tier} Plan
                </p>
                <p className={`${monoXs} text-slate-500 mt-0.5`}>
                  {usageStats.monthly_limit.toLocaleString()} verifications per month
                </p>
              </div>
              <button className="inline-flex items-center px-3 py-2 border border-white/10 text-sm leading-4 font-medium rounded-md text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors">
                Upgrade Plan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Usage Chart Placeholder */}
      <div className={cardSurface}>
        <div className="px-6 py-4 border-b border-white/10">
          <p className={sectionLabel}>Usage Trends</p>
        </div>
        <div className="p-6">
          <div className="h-64 flex items-center justify-center border-2 border-white/10 border-dashed rounded-lg">
            <div className="text-center">
              <span className={`${sectionLabel} block`}>
                Usage charts coming soon
              </span>
              <span className={`${monoXs} text-slate-500 block mt-1`}>
                Historical usage data and trends will be displayed here
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface UsageCardProps {
  title: string;
  value: string;
  subtitle: string;
  percentage?: number;
  isWarning?: boolean;
  isError?: boolean;
}

function UsageCard({ title, value, subtitle, percentage, isWarning, isError }: UsageCardProps) {
  const getBorderColor = () => {
    if (isError) return 'border-l-rose-400';
    if (isWarning) return 'border-l-amber-400';
    return 'border-l-emerald-400';
  };

  const getAccentColor = () => {
    if (isError) return 'text-rose-300';
    if (isWarning) return 'text-amber-300';
    return 'text-emerald-300';
  };

  const borderColor = percentage !== undefined ? getBorderColor() : 'border-l-sky-400';

  return (
    <div className={`${cardSurface} border-l-[3px] ${borderColor} p-5`}>
      <div>
        <p className={sectionLabel}>{title}</p>
        <p className={`${statNumber} mt-1`}>{value}</p>
        <p className={`${monoXs} text-slate-500 mt-1`}>{subtitle}</p>
      </div>
      {percentage !== undefined && (
        <div className="mt-3">
          <span className={`${monoXs} ${getAccentColor()}`}>
            {percentage.toFixed(1)}% of limit used
          </span>
        </div>
      )}
    </div>
  );
}
