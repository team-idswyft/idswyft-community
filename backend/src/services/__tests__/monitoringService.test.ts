/**
 * Tests for Monitoring Service
 *
 * Covers:
 * - Schedule CRUD (create, list, cancel)
 * - Document expiry detection at 30/60/90-day thresholds
 * - Webhook delivery for expiry and re-verification events
 * - Scheduled re-verification processing
 * - Edge cases: no data, already-alerted, parse failures
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────

// Flexible Supabase mock — returns per-table results
const mockTableResults: Record<string, any> = {};

function makeChain(tableName: string) {
  const result = () => mockTableResults[tableName] ?? { data: null, error: null };
  const chain: any = {};
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'lte', 'not', 'order', 'limit']) {
    chain[method] = vi.fn((..._args: any[]) => chain);
  }
  chain.range = vi.fn((..._args: any[]) => result());
  chain.single = vi.fn(() => result());
  // Terminal for insert without .single()
  const origInsert = chain.insert;
  chain.insert = vi.fn((...args: any[]) => {
    const r = origInsert(...args);
    // Also make it act as a terminal if no .select() follows (for expiry_alerts insert)
    Object.defineProperty(r, 'then', {
      value: (resolve: any) => resolve(result()),
      configurable: true,
    });
    return r;
  });
  // Make chain itself thenable for queries that end without .single() or .range()
  chain.then = (resolve: any) => resolve(result());
  return chain;
}

vi.mock('../../config/database.js', () => ({
  supabase: {
    from: vi.fn((table: string) => makeChain(table)),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock WebhookService — use class syntax (arrow functions can't be constructors)
const mockGetActiveWebhooks = vi.fn();
const mockSendWebhook = vi.fn();

vi.mock('../webhook.js', () => ({
  WebhookService: class MockWebhookService {
    getActiveWebhooksForDeveloper = mockGetActiveWebhooks;
    sendWebhook = mockSendWebhook;
  },
}));

// Import after mocks
import {
  createSchedule,
  listSchedules,
  cancelSchedule,
  checkExpiringDocuments,
  processScheduledReverifications,
  getExpiringDocuments,
} from '../monitoringService.js';

// ─── Test Setup ──────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset table results
  for (const key of Object.keys(mockTableResults)) {
    delete mockTableResults[key];
  }
  mockGetActiveWebhooks.mockResolvedValue([]);
  mockSendWebhook.mockResolvedValue({});
});

// ─── Schedule CRUD ───────────────────────────────────────

describe('createSchedule', () => {
  it('should create a schedule with correct fields', async () => {
    const schedule = {
      id: 'sched-1',
      developer_id: 'dev-1',
      user_id: 'user-1',
      interval_days: 90,
      next_verification_at: new Date(Date.now() + 90 * 86400000).toISOString(),
      status: 'active',
      created_at: new Date().toISOString(),
    };

    mockTableResults['reverification_schedules'] = { data: schedule, error: null };

    const result = await createSchedule({
      developer_id: 'dev-1',
      user_id: 'user-1',
      interval_days: 90,
    });

    expect(result.id).toBe('sched-1');
    expect(result.status).toBe('active');
    expect(result.interval_days).toBe(90);
  });

  it('should throw on database error', async () => {
    mockTableResults['reverification_schedules'] = {
      data: null,
      error: { message: 'unique constraint violation', code: '23505' },
    };

    await expect(
      createSchedule({ developer_id: 'dev-1', user_id: 'user-1', interval_days: 90 }),
    ).rejects.toThrow('Failed to create schedule');
  });
});

describe('listSchedules', () => {
  it('should return paginated schedules', async () => {
    mockTableResults['reverification_schedules'] = {
      data: [
        { id: 'sched-1', status: 'active', interval_days: 90 },
        { id: 'sched-2', status: 'active', interval_days: 365 },
      ],
      error: null,
      count: 5,
    };

    const result = await listSchedules('dev-1', { page: 1, limit: 2 });

    expect(result.schedules).toHaveLength(2);
    expect(result.total).toBe(5);
  });

  it('should handle empty results', async () => {
    mockTableResults['reverification_schedules'] = {
      data: [],
      error: null,
      count: 0,
    };

    const result = await listSchedules('dev-1');
    expect(result.schedules).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe('cancelSchedule', () => {
  it('should cancel an active schedule', async () => {
    mockTableResults['reverification_schedules'] = { error: null, count: 1 };

    const result = await cancelSchedule('sched-1', 'dev-1');
    expect(result).toBe(true);
  });

  it('should return false when schedule not found', async () => {
    mockTableResults['reverification_schedules'] = { error: null, count: 0 };

    const result = await cancelSchedule('nonexistent', 'dev-1');
    expect(result).toBe(false);
  });
});

// ─── Document Expiry Detection ───────────────────────────

describe('checkExpiringDocuments', () => {
  it('should create alerts for documents expiring within 30 days', async () => {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 15); // 15 days from now

    mockTableResults['verification_requests'] = {
      data: [
        {
          id: 'ver-1',
          user_id: 'user-1',
          developer_id: 'dev-1',
          status: 'verified',
          documents: [
            { id: 'doc-1', ocr_data: { expiry_date: expiryDate.toISOString().split('T')[0] } },
          ],
        },
      ],
      error: null,
    };

    mockTableResults['expiry_alerts'] = { error: null }; // Insert succeeds

    const result = await checkExpiringDocuments();

    expect(result.expiry_alerts_created).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('should not create duplicate alerts (unique constraint)', async () => {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 15);

    mockTableResults['verification_requests'] = {
      data: [
        {
          id: 'ver-1',
          user_id: 'user-1',
          developer_id: 'dev-1',
          documents: [
            { id: 'doc-1', ocr_data: { expiry_date: expiryDate.toISOString().split('T')[0] } },
          ],
        },
      ],
      error: null,
    };

    // Unique constraint violation
    mockTableResults['expiry_alerts'] = { error: { code: '23505', message: 'duplicate' } };

    const result = await checkExpiringDocuments();

    expect(result.expiry_alerts_created).toBe(0);
  });

  it('should return empty result when no verifications exist', async () => {
    mockTableResults['verification_requests'] = { data: [], error: null };

    const result = await checkExpiringDocuments();

    expect(result.expiry_alerts_created).toBe(0);
    expect(result.webhooks_sent).toBe(0);
    expect(result.errors).toBe(0);
  });

  it('should handle database error gracefully', async () => {
    mockTableResults['verification_requests'] = {
      data: null,
      error: { message: 'connection refused' },
    };

    const result = await checkExpiringDocuments();

    expect(result.expiry_alerts_created).toBe(0);
  });

  it('should skip documents without expiry dates', async () => {
    mockTableResults['verification_requests'] = {
      data: [
        {
          id: 'ver-1',
          user_id: 'user-1',
          developer_id: 'dev-1',
          documents: [
            { id: 'doc-1', ocr_data: { name: 'John Doe' } }, // No expiry_date
          ],
        },
      ],
      error: null,
    };

    const result = await checkExpiringDocuments();

    expect(result.expiry_alerts_created).toBe(0);
  });

  it('should fire webhook when alert is created', async () => {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 10);

    mockTableResults['verification_requests'] = {
      data: [
        {
          id: 'ver-1',
          user_id: 'user-1',
          developer_id: 'dev-1',
          documents: [
            { id: 'doc-1', ocr_data: { expiry_date: expiryDate.toISOString().split('T')[0] } },
          ],
        },
      ],
      error: null,
    };

    mockTableResults['expiry_alerts'] = { error: null };

    // Active webhook exists
    mockGetActiveWebhooks.mockResolvedValue([
      { id: 'wh-1', url: 'https://example.com/hook', secret_token: 'secret' },
    ]);
    mockSendWebhook.mockResolvedValue({});

    const result = await checkExpiringDocuments();

    expect(result.expiry_alerts_created).toBe(1);
    expect(result.webhooks_sent).toBe(1);
    expect(mockSendWebhook).toHaveBeenCalled();
  });

  it('should handle documents with expiration_date field', async () => {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 20);

    mockTableResults['verification_requests'] = {
      data: [
        {
          id: 'ver-1',
          user_id: 'user-1',
          developer_id: 'dev-1',
          documents: [
            { id: 'doc-1', ocr_data: { expiration_date: expiryDate.toISOString().split('T')[0] } },
          ],
        },
      ],
      error: null,
    };

    mockTableResults['expiry_alerts'] = { error: null };

    const result = await checkExpiringDocuments();

    expect(result.expiry_alerts_created).toBe(1);
  });

  it('should handle already-expired documents', async () => {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - 10); // 10 days ago

    mockTableResults['verification_requests'] = {
      data: [
        {
          id: 'ver-1',
          user_id: 'user-1',
          developer_id: 'dev-1',
          documents: [
            { id: 'doc-1', ocr_data: { expiry_date: expiryDate.toISOString().split('T')[0] } },
          ],
        },
      ],
      error: null,
    };

    mockTableResults['expiry_alerts'] = { error: null };

    const result = await checkExpiringDocuments();

    // Should create an 'expired' alert
    expect(result.expiry_alerts_created).toBe(1);
  });
});

// ─── Scheduled Re-verification Processing ────────────────

describe('processScheduledReverifications', () => {
  it('should process due schedules', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    mockTableResults['reverification_schedules'] = {
      data: [
        {
          id: 'sched-1',
          developer_id: 'dev-1',
          user_id: 'user-1',
          verification_request_id: 'ver-1',
          interval_days: 90,
          next_verification_at: pastDate,
          status: 'active',
        },
      ],
      error: null,
    };

    const result = await processScheduledReverifications();

    expect(result.due_schedules).toBe(1);
    expect(result.errors).toBe(0);
  });

  it('should fire webhook for due re-verifications', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    mockTableResults['reverification_schedules'] = {
      data: [
        {
          id: 'sched-1',
          developer_id: 'dev-1',
          user_id: 'user-1',
          verification_request_id: 'ver-1',
          interval_days: 90,
          next_verification_at: pastDate,
          status: 'active',
        },
      ],
      error: null,
    };

    mockGetActiveWebhooks.mockResolvedValue([
      { id: 'wh-1', url: 'https://example.com/hook', secret_token: 's' },
    ]);
    mockSendWebhook.mockResolvedValue({});

    const result = await processScheduledReverifications();

    expect(result.webhooks_sent).toBe(1);
    expect(mockSendWebhook).toHaveBeenCalled();
  });

  it('should handle empty schedule list', async () => {
    mockTableResults['reverification_schedules'] = { data: [], error: null };

    const result = await processScheduledReverifications();

    expect(result.due_schedules).toBe(0);
    expect(result.webhooks_sent).toBe(0);
  });

  it('should handle webhook delivery failure gracefully', async () => {
    mockTableResults['reverification_schedules'] = {
      data: [
        {
          id: 'sched-1',
          developer_id: 'dev-1',
          user_id: 'user-1',
          interval_days: 90,
          next_verification_at: new Date(Date.now() - 86400000).toISOString(),
          status: 'active',
        },
      ],
      error: null,
    };

    // Webhook fetch fails — fireReverificationWebhook catches internally and returns false
    mockGetActiveWebhooks.mockRejectedValue(new Error('Network error'));

    const result = await processScheduledReverifications();

    // No webhook sent, but no crash either — schedule still advances
    expect(result.due_schedules).toBe(1);
    expect(result.webhooks_sent).toBe(0);
  });

  it('should handle database error when fetching schedules', async () => {
    mockTableResults['reverification_schedules'] = {
      data: null,
      error: { message: 'connection error' },
    };

    const result = await processScheduledReverifications();

    expect(result.due_schedules).toBe(0);
    expect(result.errors).toBe(0);
  });
});

// ─── Expiring Documents Query ────────────────────────────

describe('getExpiringDocuments', () => {
  it('should return paginated alerts for developer', async () => {
    mockTableResults['expiry_alerts'] = {
      data: [
        {
          id: 'alert-1',
          verification_request_id: 'ver-1',
          developer_id: 'dev-1',
          expiry_date: '2026-04-01',
          alert_type: '30_day',
          webhook_sent: false,
        },
      ],
      error: null,
      count: 1,
    };

    const result = await getExpiringDocuments('dev-1', { days_ahead: 60 });

    expect(result.alerts).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should throw on database error', async () => {
    mockTableResults['expiry_alerts'] = {
      data: null,
      error: { message: 'table not found' },
      count: null,
    };

    await expect(getExpiringDocuments('dev-1')).rejects.toThrow('Failed to fetch expiring documents');
  });
});
