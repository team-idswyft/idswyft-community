import { z } from 'zod';

// ─── Analysis Frame: one captured frame during the guided challenge ───

export const AnalysisFrameSchema = z.object({
  /** Base64-encoded JPEG frame (~20-50KB each) */
  frame_base64: z.string().max(200_000),
  /** Capture timestamp (performance.now()) */
  timestamp: z.number(),
  /** Which phase of the challenge this frame was captured during */
  phase: z.enum([
    'color_red', 'color_green', 'color_blue', 'color_white',
    'turn_start', 'turn_peak', 'turn_return',
  ]),
  /** RGB value of the color that was flashed on screen (color phases only) */
  color_rgb: z.tuple([z.number(), z.number(), z.number()]).optional(),
});

export type AnalysisFrame = z.infer<typeof AnalysisFrameSchema>;

// ─── Multi-Frame Liveness Metadata: full challenge payload ───

export const MultiFrameLivenessMetadataSchema = z.object({
  /** Challenge type — multi-frame with color reflection */
  challenge_type: z.literal('multi_frame_color'),
  /** Direction the user was asked to turn their head */
  challenge_direction: z.enum(['left', 'right']),
  /** Analysis frames captured during the challenge (5-10 frames) */
  frames: z.array(AnalysisFrameSchema).min(5).max(10),
  /** Ordered list of RGB colors that were flashed on screen */
  color_sequence: z.array(z.tuple([z.number(), z.number(), z.number()])),
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

export type MultiFrameLivenessMetadata = z.infer<typeof MultiFrameLivenessMetadataSchema>;
