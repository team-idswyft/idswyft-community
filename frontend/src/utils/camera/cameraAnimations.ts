/**
 * Shared CSS keyframe animations used by both IDCameraCapture and SelfieCameraCapture.
 *
 * Each component has its own pulse animation (focusPulse vs selfiePulse),
 * but shutterFlash and camFadeIn are identical.
 */

const sharedKeyframes = `
@keyframes shutterFlash { 0%{opacity:0} 10%{opacity:0.8} 100%{opacity:0} }
@keyframes camFadeIn { from{opacity:0} to{opacity:1} }
`;

export const idCameraCss = `
@keyframes focusPulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
${sharedKeyframes}`;

export const selfieCameraCss = `
@keyframes selfiePulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
${sharedKeyframes}`;
