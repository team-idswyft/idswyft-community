import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';

const { fontFamily: dmSans } = loadDMSans();

interface FlowDiagramProps {
  delay?: number;
}

export const FlowDiagram: React.FC<FlowDiagramProps> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const adjustedFrame = Math.max(0, frame - delay);

  // Node appearances with staggered delays
  const node1Opacity = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 30, stiffness: 100, mass: 0.6 },
  });

  const node2Opacity = spring({
    frame: Math.max(0, adjustedFrame - 20),
    fps,
    config: { damping: 30, stiffness: 100, mass: 0.6 },
  });

  const node3Opacity = spring({
    frame: Math.max(0, adjustedFrame - 40),
    fps,
    config: { damping: 30, stiffness: 100, mass: 0.6 },
  });

  // Connection line progress
  const line1Progress = interpolate(adjustedFrame, [15, 35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const line2Progress = interpolate(adjustedFrame, [35, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Center node pulse (starts after all nodes visible)
  const pulseFrame = Math.max(0, adjustedFrame - 60);
  const pulseScale = 1 + Math.sin(pulseFrame * 0.08) * 0.03;
  const pulseShadowOpacity = 0.15 + Math.sin(pulseFrame * 0.08) * 0.1;

  const nodeWidth = 260;
  const nodeHeight = 180;
  const gap = 120;
  const totalWidth = nodeWidth * 3 + gap * 2;
  const startX = (1920 - totalWidth) / 2;
  const nodeY = 1080 / 2 - nodeHeight / 2 + 30;

  const nodes = [
    {
      x: startX,
      label: 'Your App',
      sublabel: 'API Call',
      opacity: node1Opacity,
      isCenter: false,
      icon: 'code',
    },
    {
      x: startX + nodeWidth + gap,
      label: 'Idswyft VaaS',
      sublabel: 'Verify & Match',
      opacity: node2Opacity,
      isCenter: true,
      icon: 'shield',
    },
    {
      x: startX + (nodeWidth + gap) * 2,
      label: 'Verified User',
      sublabel: 'Authenticated',
      opacity: node3Opacity,
      isCenter: false,
      icon: 'check',
    },
  ];

  const renderIcon = (type: string, isCenter: boolean) => {
    const iconColor = isCenter ? '#22d3ee' : '#64748b';
    const iconSize = 40;

    if (type === 'code') {
      return (
        <div
          style={{
            width: iconSize + 8,
            height: iconSize + 8,
            borderRadius: 8,
            background: 'rgba(100,116,139,0.1)',
            border: '1px solid rgba(100,116,139,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </div>
      );
    }

    if (type === 'shield') {
      return (
        <div
          style={{
            width: iconSize + 8,
            height: iconSize + 8,
            borderRadius: 8,
            background: 'rgba(34,211,238,0.1)',
            border: '1px solid rgba(34,211,238,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
      );
    }

    // check
    return (
      <div
        style={{
          width: iconSize + 8,
          height: iconSize + 8,
          borderRadius: 8,
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Connection lines */}
      <svg
        style={{ position: 'absolute', inset: 0 }}
        width="1920"
        height="1080"
        viewBox="0 0 1920 1080"
      >
        {/* Line 1: Node 1 -> Node 2 */}
        <line
          x1={startX + nodeWidth}
          y1={nodeY + nodeHeight / 2}
          x2={startX + nodeWidth + gap}
          y2={nodeY + nodeHeight / 2}
          stroke="#22d3ee"
          strokeWidth={3}
          strokeDasharray={gap}
          strokeDashoffset={gap * (1 - line1Progress)}
          opacity={0.6}
        />
        {/* Glow for line 1 */}
        <line
          x1={startX + nodeWidth}
          y1={nodeY + nodeHeight / 2}
          x2={startX + nodeWidth + gap}
          y2={nodeY + nodeHeight / 2}
          stroke="#22d3ee"
          strokeWidth={8}
          strokeDasharray={gap}
          strokeDashoffset={gap * (1 - line1Progress)}
          opacity={0.15}
          filter="blur(4px)"
        />
        {/* Arrow head for line 1 */}
        {line1Progress > 0.8 && (
          <polygon
            points={`${startX + nodeWidth + gap - 2},${nodeY + nodeHeight / 2 - 6} ${startX + nodeWidth + gap + 6},${nodeY + nodeHeight / 2} ${startX + nodeWidth + gap - 2},${nodeY + nodeHeight / 2 + 6}`}
            fill="#22d3ee"
            opacity={interpolate(line1Progress, [0.8, 1], [0, 0.6], { extrapolateRight: 'clamp' })}
          />
        )}

        {/* Line 2: Node 2 -> Node 3 */}
        <line
          x1={startX + nodeWidth * 2 + gap}
          y1={nodeY + nodeHeight / 2}
          x2={startX + nodeWidth * 2 + gap * 2}
          y2={nodeY + nodeHeight / 2}
          stroke="#22d3ee"
          strokeWidth={3}
          strokeDasharray={gap}
          strokeDashoffset={gap * (1 - line2Progress)}
          opacity={0.6}
        />
        {/* Glow for line 2 */}
        <line
          x1={startX + nodeWidth * 2 + gap}
          y1={nodeY + nodeHeight / 2}
          x2={startX + nodeWidth * 2 + gap * 2}
          y2={nodeY + nodeHeight / 2}
          stroke="#22d3ee"
          strokeWidth={8}
          strokeDasharray={gap}
          strokeDashoffset={gap * (1 - line2Progress)}
          opacity={0.15}
          filter="blur(4px)"
        />
        {/* Arrow head for line 2 */}
        {line2Progress > 0.8 && (
          <polygon
            points={`${startX + nodeWidth * 2 + gap * 2 - 2},${nodeY + nodeHeight / 2 - 6} ${startX + nodeWidth * 2 + gap * 2 + 6},${nodeY + nodeHeight / 2} ${startX + nodeWidth * 2 + gap * 2 - 2},${nodeY + nodeHeight / 2 + 6}`}
            fill="#22d3ee"
            opacity={interpolate(line2Progress, [0.8, 1], [0, 0.6], { extrapolateRight: 'clamp' })}
          />
        )}
      </svg>

      {/* Nodes */}
      {nodes.map((node, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: node.x,
            top: nodeY,
            width: nodeWidth,
            height: nodeHeight,
            borderRadius: 20,
            background: node.isCenter
              ? 'rgba(34,211,238,0.05)'
              : 'rgba(255,255,255,0.03)',
            border: node.isCenter
              ? '1px solid rgba(34,211,238,0.3)'
              : '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: node.opacity,
            transform: node.isCenter
              ? `scale(${pulseScale})`
              : 'scale(1)',
            boxShadow: node.isCenter
              ? `0 0 40px rgba(34,211,238,${pulseShadowOpacity}), 0 0 80px rgba(34,211,238,${pulseShadowOpacity * 0.5})`
              : 'none',
          }}
        >
          {renderIcon(node.icon, node.isCenter)}
          <span
            style={{
              fontFamily: dmSans,
              fontSize: 26,
              fontWeight: 600,
              color: node.isCenter ? '#22d3ee' : '#f1f5f9',
              marginBottom: 4,
            }}
          >
            {node.label}
          </span>
          <span
            style={{
              fontFamily: dmSans,
              fontSize: 20,
              fontWeight: 400,
              color: '#475569',
            }}
          >
            {node.sublabel}
          </span>
        </div>
      ))}
    </div>
  );
};
