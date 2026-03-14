import React from 'react';

const CSS_VARS = {
  teal: '#00d4b4',
  navy: '#040d1a',
  muted: '#4a6a7a',
  border: 'rgba(0,212,180,0.15)',
};

export const FaceViewfinder: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
      }}
    >
      <div
        style={{
          width: 188,
          height: 228,
          borderRadius: '114px 114px 94px 94px',
          position: 'relative',
          overflow: 'hidden',
          border: `2px solid ${CSS_VARS.teal}`,
          animation: 'gPulse 2s ease-in-out infinite',
        }}
      >
        {/* Dot grid background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(circle, rgba(0,212,180,0.12) 1px, transparent 1px)',
            backgroundSize: '12px 12px',
          }}
        />

        {/* Real face photo — enlarged to fill the oval naturally */}
        <div
          style={{
            position: 'absolute',
            inset: -20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            borderRadius: 'inherit',
          }}
        >
          <img
            src="https://kcjugatpfhccjroyliku.supabase.co/storage/v1/object/public/specimen-assets/face.gif"
            alt=""
            style={{
              width: '130%',
              height: '130%',
              objectFit: 'cover',
              objectPosition: 'center 30%',
              opacity: 0.5,
              filter: 'brightness(0.65) saturate(0.5)',
            }}
          />
        </div>

        {/* Scan line (fscan) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${CSS_VARS.teal}, transparent)`,
            boxShadow: `0 0 10px ${CSS_VARS.teal}`,
            opacity: 0.7,
            animation: 'fscan 2.5s ease-in-out infinite',
          }}
        />
      </div>

      <style>
        {`
          @keyframes gPulse {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(0,212,180,0.3), 0 0 20px rgba(0,212,180,0.1);
            }
            50% {
              box-shadow: 0 0 0 6px rgba(0,212,180,0.08), 0 0 30px rgba(0,212,180,0.15);
            }
          }
          @keyframes fscan {
            0% { top: 10%; }
            50% { top: 85%; }
            100% { top: 10%; }
          }
        `}
      </style>
    </div>
  );
};
