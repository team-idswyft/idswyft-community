import { LivenessProvider } from '../types.js';
import { EnhancedHeuristicProvider } from './EnhancedHeuristicProvider.js';

export function createLivenessProvider(): LivenessProvider {
  const name = process.env.LIVENESS_PROVIDER ?? 'enhanced-heuristic';

  switch (name) {
    case 'enhanced-heuristic':
      return new EnhancedHeuristicProvider();
    default:
      return new EnhancedHeuristicProvider();
  }
}

export { EnhancedHeuristicProvider } from './EnhancedHeuristicProvider.js';
