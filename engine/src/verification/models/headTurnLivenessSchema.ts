import { z } from 'zod';

// ─── Analysis Frame: one captured frame during the head-turn challenge ───

export const AnalysisFrameSchema = z.object({
  /** Base64-encoded JPEG frame (~20-50KB each) */
  frame_base64: z.string().max(200_000),
  /** Capture timestamp (performance.now()) */
  timestamp: z.number(),
  /** Which phase of the challenge this frame was captured during */
  phase: z.enum([
    'turn1_start', 'turn1_peak', 'turn1_return',
    'turn_start', 'turn_peak', 'turn_return',
  ]),
  /** RGB value (legacy — optional, not required for head-turn) */
  color_rgb: z.tuple([z.number(), z.number(), z.number()]).optional(),
});

export type AnalysisFrame = z.infer<typeof AnalysisFrameSchema>;

// ─── Head-Turn Liveness Metadata: full challenge payload ───

export const HeadTurnLivenessMetadataSchema = z.object({
  /** Challenge type — head-turn with timed frame capture */
  challenge_type: z.literal('head_turn'),
  /** Direction the user was asked to turn their head */
  challenge_direction: z.enum(['left', 'right']),
  /** Analysis frames captured during the challenge (5-12 frames) */
  frames: z.array(AnalysisFrameSchema).min(5).max(12),
  /** Legacy color sequence — optional, clients can omit */
  color_sequence: z.array(z.tuple([z.number(), z.number(), z.number()])).optional().default([]),
  /** Challenge start timestamp (ms) */
  start_timestamp: z.number(),
  /** Challenge end timestamp (ms) */
  end_timestamp: z.number(),
  /** Viewport dimensions for context */
  screen_width: z.number().optional(),
  screen_height: z.number().optional(),
  /** Virtual camera detection result from client */
  virtual_camera_check: z.object({
    label: z.string(),
    suspected_virtual: z.boolean(),
  }).optional(),
});

export type HeadTurnLivenessMetadata = z.infer<typeof HeadTurnLivenessMetadataSchema>;
