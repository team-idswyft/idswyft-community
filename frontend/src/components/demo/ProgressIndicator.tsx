import React from 'react';
import { C } from '../../theme';

interface ProgressIndicatorProps {
  currentStep: number;
  isMobile: boolean;
  stepLabels?: string[];
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ currentStep, isMobile, stepLabels }) => {
  const steps = stepLabels || ['Start', 'Front ID', 'Back ID', 'Checking', 'Live Photo', 'Results'];

  return (
    <div style={{ marginBottom: isMobile ? 24 : 32 }}>
      {/* Segment bars */}
      <div style={{ display: 'flex', gap: 6 }}>
        {steps.map((_, i) => {
          const stepNum = i + 1;
          const isDone = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          return (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2, position: 'relative',
              background: isDone ? C.cyan : 'rgba(255,255,255,0.06)',
              boxShadow: isDone ? '0 0 6px rgba(34,211,238,0.4)' : 'none',
              transition: 'all 0.3s',
            }}>
              {isActive && (
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: 2,
                  background: `linear-gradient(90deg, ${C.cyan}, transparent)`,
                  animation: 'dSegPulse 1.8s ease-in-out infinite',
                }} />
              )}
            </div>
          );
        })}
      </div>
      {/* Labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        {steps.map((label, i) => {
          const stepNum = i + 1;
          const isDone = stepNum < currentStep;
          const isActive = stepNum === currentStep;
          return (
            <span key={i} style={{
              fontFamily: C.mono,
              fontSize: isMobile ? 8 : 10,
              fontWeight: 400,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: isDone ? C.cyan : isActive ? C.text : C.dim,
              transition: 'color 0.3s',
            }}>{label}</span>
          );
        })}
      </div>
    </div>
  );
};
