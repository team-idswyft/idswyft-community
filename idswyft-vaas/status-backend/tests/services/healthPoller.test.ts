import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database before importing
vi.mock('../../src/config/database.js', () => ({
  statusDb: {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
  },
  default: {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockResolvedValue({ error: null }),
  },
}));

vi.mock('../../src/config/index.js', () => ({
  config: {
    monitoredServices: [
      { id: 'test_api', name: 'Test API', healthUrl: 'http://localhost:9999/health' },
    ],
    pollIntervalMs: 60000,
    vaas: { apiUrl: '', serviceToken: '' },
  },
  default: {
    monitoredServices: [
      { id: 'test_api', name: 'Test API', healthUrl: 'http://localhost:9999/health' },
    ],
    pollIntervalMs: 60000,
    vaas: { apiUrl: '', serviceToken: '' },
  },
}));

describe('HealthPoller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should determine operational status for fast 200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const { HealthPoller } = await import('../../src/services/healthPoller.js');
    const poller = HealthPoller.getInstance();
    const results = await poller.checkAllServices();

    expect(results).toHaveLength(1);
    expect(results[0].service).toBe('test_api');
    expect(results[0].status).toBe('operational');
    expect(results[0].latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('should determine down status for network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const { HealthPoller } = await import('../../src/services/healthPoller.js');
    const poller = HealthPoller.getInstance();
    const results = await poller.checkAllServices();

    expect(results[0].status).toBe('down');
    expect(results[0].details).toContain('ECONNREFUSED');
  });

  it('should determine down status for non-200 response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const { HealthPoller } = await import('../../src/services/healthPoller.js');
    const poller = HealthPoller.getInstance();
    const results = await poller.checkAllServices();

    expect(results[0].status).toBe('down');
  });
});
