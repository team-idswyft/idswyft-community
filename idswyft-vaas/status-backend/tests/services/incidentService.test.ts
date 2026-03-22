import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../src/config/database.js', () => ({
  statusDb: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
  default: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

vi.mock('../../src/config/index.js', () => ({
  config: { incidentRetentionDays: 90 },
  default: { incidentRetentionDays: 90 },
}));

describe('IncidentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create an incident with default investigating status', async () => {
    const mockIncident = {
      id: 'test-id',
      title: 'API Latency',
      status: 'investigating',
      severity: 'minor',
      affected_services: ['main_api'],
      created_at: '2026-03-22T00:00:00Z',
      resolved_at: null,
      created_by: 'admin@test.com',
    };

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockIncident, error: null }),
        }),
      }),
    });

    const { incidentService } = await import('../../src/services/incidentService.js');
    const result = await incidentService.create({
      title: 'API Latency',
      severity: 'minor',
      affected_services: ['main_api'],
      created_by: 'admin@test.com',
    });

    expect(result.title).toBe('API Latency');
    expect(result.status).toBe('investigating');
    expect(mockFrom).toHaveBeenCalledWith('incidents');
  });

  it('should set resolved_at when status changes to resolved', async () => {
    const mockUpdated = {
      id: 'test-id',
      title: 'API Latency',
      status: 'resolved',
      resolved_at: '2026-03-22T01:00:00Z',
    };

    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockUpdated, error: null }),
          }),
        }),
      }),
    });

    const { incidentService } = await import('../../src/services/incidentService.js');
    const result = await incidentService.update('test-id', { status: 'resolved' });

    expect(result.resolved_at).toBeTruthy();
  });
});
