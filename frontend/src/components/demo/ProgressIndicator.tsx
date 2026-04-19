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
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
      gap: 8,
      fontFamily: C.mono,
      fontSize: 11,
      marginBottom: isMobile ? 24 : 32,
    }}>
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < currentStep;
        const isActive = stepNum === currentStep;
        return (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: 8,
            alignItems: 'center',
            padding: '6px 0',
            borderTop: `2px solid ${isDone ? C.accent : isActive ? C.text : C.border}`,
            color: isDone ? C.accentInk : isActive ? C.text : C.muted,
            transition: 'border-color 0.3s, color 0.3s',
          }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{stepNum}</span>
            <span style={{
              fontSize: isMobile ? 8 : 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
};
