import React from 'react';

interface ProgressIndicatorProps {
  currentStep: number;
  isMobile: boolean;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ currentStep, isMobile }) => {
  const steps = ['Start', 'Front ID', 'Back ID', 'Live Capture', 'Results', 'Address'];
  const circleSize = isMobile ? 26 : 32;
  return (
    <div style={{ marginBottom: isMobile ? 24 : 36 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {steps.map((label, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isActive    = stepNum === currentStep;
          return (
            <React.Fragment key={stepNum}>
              <div style={{ flexShrink: 0, textAlign: 'center', minWidth: isMobile ? 48 : 72 }}>
                <div style={{
                  width: circleSize, height: circleSize, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 4px',
                  fontFamily: '"IBM Plex Mono","Fira Code",monospace',
                  fontSize: isMobile ? 10 : 12, fontWeight: 600,
                  background: isCompleted ? '#34d399' : isActive ? 'rgba(34,211,238,0.15)' : 'transparent',
                  border: isCompleted ? '1px solid #34d399' : isActive ? '1px solid #22d3ee' : '1px solid rgba(255,255,255,0.07)',
                  color: isCompleted ? '#080c14' : isActive ? '#22d3ee' : '#4a5568',
                  transition: 'all 0.2s',
                }}>
                  {isCompleted ? '\u2713' : stepNum}
                </div>
                <span style={{
                  fontSize: isMobile ? 8 : 10, fontWeight: 500, whiteSpace: 'nowrap',
                  color: isActive ? '#22d3ee' : isCompleted ? '#8896aa' : '#4a5568',
                }}>
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 1, marginTop: circleSize / 2, background: stepNum < currentStep ? '#34d399' : 'rgba(255,255,255,0.07)', transition: 'background 0.3s' }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
