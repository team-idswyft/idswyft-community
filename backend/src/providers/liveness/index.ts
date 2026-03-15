import { LivenessProvider } from '../types.js';
import { HeuristicProvider } from './HeuristicProvider.js';
import { EnhancedHeuristicProvider } from './EnhancedHeuristicProvider.js';

export function createLivenessProvider(): LivenessProvider {
  const name = process.env.LIVENESS_PROVIDER ?? 'enhanced-heuristic';

  switch (name) {
    case 'heuristic':
      return new HeuristicProvider();
    case 'enhanced-heuristic':
      return new EnhancedHeuristicProvider();
    default:
      return new EnhancedHeuristicProvider();
  }
}

export { HeuristicProvider } from './HeuristicProvider.js';
export { EnhancedHeuristicProvider } from './EnhancedHeuristicProvider.js';
