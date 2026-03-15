import type { AMLProvider } from './types.js';
import { OpenSanctionsProvider } from './OpenSanctionsProvider.js';
import { OfflineListProvider } from './OfflineListProvider.js';

export function createAMLProvider(): AMLProvider | null {
  const name = process.env.AML_PROVIDER ?? 'none';

  switch (name) {
    case 'opensanctions':
      return new OpenSanctionsProvider();
    case 'offline':
      return new OfflineListProvider();
    case 'none':
    default:
      // AML screening is optional — return null when disabled
      return null;
  }
}

export { OpenSanctionsProvider } from './OpenSanctionsProvider.js';
export { OfflineListProvider } from './OfflineListProvider.js';
export type { AMLProvider, AMLScreeningInput, AMLScreeningResult, AMLMatch, AMLRiskLevel } from './types.js';
