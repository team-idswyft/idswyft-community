import { AbsoluteFill, Series } from 'remotion';
import { loadFont as loadSyne } from '@remotion/google-fonts/Syne';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadIBMPlexMono } from '@remotion/google-fonts/IBMPlexMono';
import { ProblemScene } from './components/ProblemScene';
import { SolutionScene } from './components/SolutionScene';
import { HowItWorksScene } from './components/HowItWorksScene';
import { ResultsScene } from './components/ResultsScene';

// Pre-load fonts at composition level
loadSyne();
loadDMSans();
loadIBMPlexMono();

export const VaaSMarketing: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#05080f',
      }}
    >
      <Series>
        {/* Scene 1: The Problem — frames 0–180 (6s at 30fps) */}
        <Series.Sequence durationInFrames={180}>
          <AbsoluteFill>
            <ProblemScene />
          </AbsoluteFill>
        </Series.Sequence>

        {/* Scene 2: The Solution — frames 180–360 (6s) */}
        <Series.Sequence durationInFrames={180}>
          <AbsoluteFill>
            <SolutionScene />
          </AbsoluteFill>
        </Series.Sequence>

        {/* Scene 3: How It Works — frames 360–540 (6s) */}
        <Series.Sequence durationInFrames={180}>
          <AbsoluteFill>
            <HowItWorksScene />
          </AbsoluteFill>
        </Series.Sequence>

        {/* Scene 4: Results — frames 540–720 (6s) */}
        <Series.Sequence durationInFrames={180}>
          <AbsoluteFill>
            <ResultsScene />
          </AbsoluteFill>
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
