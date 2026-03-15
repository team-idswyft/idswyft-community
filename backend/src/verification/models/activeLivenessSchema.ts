import { z } from 'zod';

// ─── Head Pose Sample: one frame of head-tracking data ───
export const HeadPoseSampleSchema = z.object({
  /** Millisecond timestamp (performance.now() or Date.now()) */
  timestamp: z.number().nonnegative(),
  /** Yaw angle in degrees: -90 (left) to +90 (right) */
  yaw: z.number().min(-90).max(90),
  /** Pitch angle in degrees: -90 (down) to +90 (up) */
  pitch: z.number().min(-90).max(90),
  /** Roll angle in degrees: -90 to +90 */
  roll: z.number().min(-90).max(90),
  /**
   * 18-number array: 6 key landmarks × 3 coords (x, y, z).
   * Landmarks: nose tip (#1), chin (#152), left eye outer (#33),
   * right eye outer (#263), left mouth (#61), right mouth (#291).
   */
  landmarks: z.array(z.number()).length(18),
});

export type HeadPoseSample = z.infer<typeof HeadPoseSampleSchema>;

// ─── Active Liveness Metadata: full challenge payload ───
export const ActiveLivenessMetadataSchema = z.object({
  /** Challenge type — currently only head_turn */
  challenge_type: z.literal('head_turn'),
  /** Direction the user was asked to turn */
  challenge_direction: z.enum(['left', 'right']),
  /** Timestamped head-pose samples (5–60 frames) */
  samples: z.array(HeadPoseSampleSchema).min(5).max(60),
  /** Challenge start timestamp (ms) */
  start_timestamp: z.number().nonnegative(),
  /** Challenge end timestamp (ms) */
  end_timestamp: z.number().nonnegative(),
  /** MediaPipe tasks-vision version string */
  mediapipe_version: z.string().optional(),
  /** Viewport dimensions for context */
  screen_width: z.number().int().positive().optional(),
  screen_height: z.number().int().positive().optional(),
});

export type ActiveLivenessMetadata = z.infer<typeof ActiveLivenessMetadataSchema>;
