import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';

export class ProviderMetricsService {
  async record(data: {
    providerName: string;
    providerType: 'ocr' | 'face' | 'liveness';
    verificationId?: string;
    latencyMs: number;
    success: boolean;
    confidenceScore?: number;
    errorType?: string;
  }): Promise<void> {
    const { error } = await supabase.from('provider_metrics').insert({
      provider_name: data.providerName,
      provider_type: data.providerType,
      verification_id: data.verificationId ?? null,
      latency_ms: data.latencyMs,
      success: data.success,
      confidence_score: data.confidenceScore ?? null,
      error_type: data.errorType ?? null,
    });

    if (error) logger.warn('Failed to record provider metrics', { error });
  }

  async getProviderSummary(providerName: string, days = 30): Promise<{
    totalRequests: number;
    successRate: number;
    avgLatencyMs: number;
    avgConfidence: number;
  }> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('provider_metrics')
      .select('success, latency_ms, confidence_score')
      .eq('provider_name', providerName)
      .gte('created_at', cutoff);

    if (!data || data.length === 0) {
      return { totalRequests: 0, successRate: 0, avgLatencyMs: 0, avgConfidence: 0 };
    }

    return {
      totalRequests: data.length,
      successRate: data.filter((d: any) => d.success).length / data.length,
      avgLatencyMs: data.reduce((s: any, d: any) => s + (d.latency_ms ?? 0), 0) / data.length,
      avgConfidence: data.reduce((s: any, d: any) => s + (d.confidence_score ?? 0), 0) / data.length,
    };
  }
}
