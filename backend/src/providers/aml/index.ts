import type { AMLProvider } from './types.js';
import { OpenSanctionsProvider } from './OpenSanctionsProvider.js';
import { OfflineListProvider } from './OfflineListProvider.js';

/** @deprecated Use createAMLProviders() for multi-provider support */
export function createAMLProvider(): AMLProvider | null {
  const providers = createAMLProviders();
  return providers.length > 0 ? providers[0] : null;
}

/**
 * Parse AML_PROVIDER env var (comma-separated) and return all configured providers.
 * Returns empty array when "none" or unset (AML disabled).
 */
export function createAMLProviders(): AMLProvider[] {
  const raw = process.env.AML_PROVIDER ?? 'none';
  const names = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  const providers: AMLProvider[] = [];
  for (const name of names) {
    switch (name) {
      case 'opensanctions':
        providers.push(new OpenSanctionsProvider());
        break;
      case 'offline':
        providers.push(new OfflineListProvider());
        break;
      case 'none':
        // Explicit disable — return empty
        return [];
    }
  }
  return providers;
}

export { OpenSanctionsProvider } from './OpenSanctionsProvider.js';
export { OfflineListProvider } from './OfflineListProvider.js';
export type { AMLProvider, AMLScreeningInput, AMLScreeningResult, AMLMatch, AMLRiskLevel } from './types.js';
