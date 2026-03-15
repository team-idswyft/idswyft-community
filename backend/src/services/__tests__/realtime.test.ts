/**
 * Unit tests for the realtime broadcast service.
 */

vi.mock('../../config/database.js', () => {
  const mockChannel = {
    send: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  return {
    supabase: {
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('../../utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { broadcastStatusChange, subscribeToVerification } from '../realtime.js';
import { supabase } from '../../config/database.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('broadcastStatusChange', () => {
  it('creates a channel and sends a broadcast', async () => {
    await broadcastStatusChange('v-123', 'FRONT_PROCESSING', 2);

    expect(supabase.channel).toHaveBeenCalledWith('verification:v-123');

    const mockChannel = (supabase.channel as any).mock.results[0].value;
    expect(mockChannel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'status_change',
      payload: expect.objectContaining({
        verification_id: 'v-123',
        status: 'FRONT_PROCESSING',
        current_step: 2,
        final_result: null,
        rejection_reason: null,
      }),
    });

    // Should clean up channel after sending
    expect(supabase.removeChannel).toHaveBeenCalled();
  });

  it('includes final_result and rejection_reason when provided', async () => {
    await broadcastStatusChange('v-456', 'HARD_REJECTED', 6, 'failed', 'FACE_MATCH_FAILED');

    const mockChannel = (supabase.channel as any).mock.results[0].value;
    const sentPayload = mockChannel.send.mock.calls[0][0].payload;
    expect(sentPayload.final_result).toBe('failed');
    expect(sentPayload.rejection_reason).toBe('FACE_MATCH_FAILED');
  });

  it('includes a timestamp in ISO format', async () => {
    await broadcastStatusChange('v-789', 'COMPLETE', 5, 'verified');

    const mockChannel = (supabase.channel as any).mock.results[0].value;
    const sentPayload = mockChannel.send.mock.calls[0][0].payload;
    expect(sentPayload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does not throw on channel send failure', async () => {
    const mockChannel = (supabase.channel as any)();
    mockChannel.send.mockRejectedValueOnce(new Error('channel error'));
    (supabase.channel as any).mockReturnValueOnce(mockChannel);

    // Should not throw
    await expect(broadcastStatusChange('v-err', 'COMPLETE', 5)).resolves.toBeUndefined();
  });
});

describe('subscribeToVerification', () => {
  it('creates a channel subscription and returns unsubscribe', () => {
    const handler = vi.fn();
    const result = subscribeToVerification('v-sub', handler);

    expect(supabase.channel).toHaveBeenCalledWith('verification:v-sub');
    expect(typeof result.unsubscribe).toBe('function');

    // Unsubscribe should remove the channel
    result.unsubscribe();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });
});
