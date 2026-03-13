import { supabase } from '@/config/database.js';
import { logger } from '@/utils/logger.js';
import { VerificationConsistencyService } from './verificationConsistency.js';

export class ConsistencyMonitor {
  private consistencyService: VerificationConsistencyService;
  private monitorInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.consistencyService = new VerificationConsistencyService();
  }

  /**
   * Start the consistency monitor
   */
  start(intervalMs: number = 300000) { // Default: 5 minutes
    if (this.isRunning) {
      logger.warn('Consistency monitor is already running');
      return;
    }

    this.isRunning = true;
    
    logger.info('Starting verification consistency monitor', {
      intervalMs,
      intervalMinutes: intervalMs / 60000
    });

    // Run initial check
    this.performConsistencyCheck();

    // Set up periodic checks
    this.monitorInterval = setInterval(() => {
      this.performConsistencyCheck();
    }, intervalMs);
  }

  /**
   * Stop the consistency monitor
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isRunning = false;
    logger.info('Consistency monitor stopped');
  }

  /**
   * Perform consistency check on recent verifications
   */
  private async performConsistencyCheck() {
    try {
      logger.debug('Running consistency check...');

      // Get recent verifications (last 24 hours)
      const { data: recentVerifications, error } = await supabase
        .from('verification_requests')
        .select('id, status, created_at, updated_at')
        .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .in('status', ['verified', 'failed', 'manual_review'])
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) {
        logger.error('Failed to fetch recent verifications for consistency check', {
          error: error.message
        });
        return;
      }

      if (!recentVerifications || recentVerifications.length === 0) {
        logger.debug('No recent verifications to check');
        return;
      }

      let totalChecked = 0;
      let inconsistentCount = 0;
      let fixedCount = 0;
      let skippedNotFound = 0;

      // Check each verification
      for (const verification of recentVerifications) {
        try {
          const consistencyResult = await this.consistencyService.validateVerificationConsistency(
            verification.id
          );

          // Skip orphaned records — they exist in verification_requests
          // but the joined query returns null (missing related data)
          if (consistencyResult.notFound) {
            skippedNotFound++;
            continue;
          }

          totalChecked++;

          if (!consistencyResult.isConsistent) {
            inconsistentCount++;

            logger.warn('Consistency issues found in verification', {
              verificationId: verification.id,
              status: verification.status,
              issues: consistencyResult.issues,
              recommendations: consistencyResult.recommendations
            });

            // Attempt to fix by recalculating scores
            try {
              const recalculated = await this.consistencyService.recalculateConsistentScores(
                verification.id
              );

              fixedCount++;

              logger.info('Verification consistency automatically fixed', {
                verificationId: verification.id,
                oldStatus: verification.status,
                newStatus: recalculated.final_status,
                newConfidenceScore: recalculated.confidence_score
              });
            } catch (fixError) {
              logger.error('Failed to automatically fix verification consistency', {
                verificationId: verification.id,
                error: fixError instanceof Error ? fixError.message : 'Unknown error'
              });
            }
          }
        } catch (checkError) {
          logger.error('Error checking verification consistency', {
            verificationId: verification.id,
            error: checkError instanceof Error ? checkError.message : 'Unknown error'
          });
        }
      }

      // Log summary
      if (skippedNotFound > 0) {
        logger.debug('Consistency check skipped orphaned records', { skippedNotFound });
      }

      if (totalChecked > 0) {
        const consistentCount = totalChecked - inconsistentCount;
        const consistencyRate = (consistentCount / totalChecked * 100).toFixed(1);

        logger.info('Consistency check completed', {
          totalChecked,
          consistentCount,
          inconsistentCount,
          fixedCount,
          skippedNotFound,
          consistencyRate: `${consistencyRate}%`
        });

        // Alert if consistency rate is low
        if (parseFloat(consistencyRate) < 90) {
          logger.warn('LOW CONSISTENCY RATE DETECTED', {
            consistencyRate: `${consistencyRate}%`,
            message: 'Consider reviewing verification thresholds and processes'
          });
        }
      }

    } catch (error) {
      logger.error('Consistency monitor check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Check if monitor is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get monitor status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.monitorInterval ? 300000 : null, // Default interval
      lastCheck: new Date().toISOString()
    };
  }
}

// Create global instance
export const consistencyMonitor = new ConsistencyMonitor();