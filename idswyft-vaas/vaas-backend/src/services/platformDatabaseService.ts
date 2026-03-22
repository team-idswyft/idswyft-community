import { vaasSupabase, mainApiSupabase } from '../config/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

type DatabaseTarget = 'vaas' | 'main';

interface TableCategory {
  category: string;
  risk: 'safe' | 'caution';
  tables: string[];
}

interface TableStat {
  name: string;
  category: string;
  risk: 'safe' | 'caution' | 'protected';
  rowCount: number;
}

export interface DatabaseStats {
  tables: TableStat[];
  totalRows: number;
  tablesTracked: number;
  lastCleanup: string | null;
}

export interface CategoryMapEntry {
  label: string;
  risk: string;
  vaasTables: string[];
  mainTables: string[];
}

export interface PurgeResult {
  deletedCounts: Record<string, number>;
  totalDeleted: number;
}

export interface WipeResult {
  wipedTables: string[];
  totalDeleted: number;
}

// ── Table Definitions ────────────────────────────────────────────────────────

const VAAS_CATEGORIES: TableCategory[] = [
  {
    category: 'Transient Logs',
    risk: 'safe',
    tables: [
      'vaas_webhook_deliveries',
      'vaas_api_usage_logs',
      'vaas_usage_records',
      'vaas_api_key_usage',
      'vaas_refresh_tokens',
      'vaas_admin_notifications',
      'service_status_checks',
      'platform_notifications',
    ],
  },
  {
    category: 'Verification Data',
    risk: 'caution',
    tables: ['vaas_verification_sessions', 'vaas_verification_documents'],
  },
  {
    category: 'Audit Trails',
    risk: 'caution',
    tables: ['vaas_audit_logs', 'platform_config_audit'],
  },
  {
    category: 'Enterprise Signups',
    risk: 'caution',
    tables: ['vaas_enterprise_signups'],
  },
  {
    category: 'End Users',
    risk: 'caution',
    tables: ['vaas_end_users'],
  },
];

const MAIN_CATEGORIES: TableCategory[] = [
  {
    category: 'Transient Logs',
    risk: 'safe',
    tables: ['webhook_deliveries'],
  },
  {
    category: 'Verification Data',
    risk: 'caution',
    tables: ['verification_sessions', 'verification_documents', 'selfie_images'],
  },
];

const VAAS_PROTECTED = [
  'vaas_organizations',
  'vaas_admins',
  'vaas_api_keys',
  'vaas_developers',
  'vaas_webhooks',
  'vaas_organization_main_api_keys',
  'organization_sso_configs',
  'platform_admins',
  'platform_email_config',
  'platform_config',
  'platform_notification_channels',
  'platform_notification_rules',
  'platform_key_change_requests',
  'platform_branding',
  '_migrations',
];

const MAIN_PROTECTED = [
  'developers',
  'api_keys',
  '_migrations',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getClient(target: DatabaseTarget) {
  if (target === 'main') {
    if (!mainApiSupabase) {
      throw new Error('Main API database is not configured. Set MAIN_API_SUPABASE_URL and MAIN_API_SUPABASE_SERVICE_ROLE_KEY.');
    }
    return mainApiSupabase;
  }
  return vaasSupabase;
}

function getCategories(target: DatabaseTarget): TableCategory[] {
  return target === 'main' ? MAIN_CATEGORIES : VAAS_CATEGORIES;
}

function getProtectedTables(target: DatabaseTarget): string[] {
  return target === 'main' ? MAIN_PROTECTED : VAAS_PROTECTED;
}

/** Count rows in a single table via Supabase head-only select */
async function countRows(client: ReturnType<typeof getClient>, table: string): Promise<number> {
  try {
    const { count, error } = await client
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.warn(`[DatabaseService] Failed to count ${table}:`, error.message);
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ── Service ──────────────────────────────────────────────────────────────────

class PlatformDatabaseService {
  /** Get row counts and metadata for all tables in target database */
  async getDatabaseStats(target: DatabaseTarget): Promise<DatabaseStats> {
    const client = getClient(target);
    const categories = getCategories(target);
    const protectedTableNames = getProtectedTables(target);

    // Parallelize all row counts for better performance
    const purgeableEntries = categories.flatMap(cat =>
      cat.tables.map(table => ({ table, category: cat.category, risk: cat.risk as TableStat['risk'] }))
    );
    const protectedEntries = protectedTableNames.map(table => ({
      table, category: 'Protected' as const, risk: 'protected' as const,
    }));
    const allEntries = [...purgeableEntries, ...protectedEntries];

    const tableStats = await Promise.all(
      allEntries.map(async (entry) => ({
        name: entry.table,
        category: entry.category,
        risk: entry.risk,
        rowCount: await countRows(client, entry.table),
      }))
    );

    const totalRows = tableStats.reduce((sum, t) => sum + t.rowCount, 0);

    return {
      tables: tableStats,
      totalRows,
      tablesTracked: tableStats.length,
      lastCleanup: null,
    };
  }

  /** Delete rows older than N days from selected categories */
  async purgeCategories(
    target: DatabaseTarget,
    categoryNames: string[],
    olderThanDays: number
  ): Promise<PurgeResult> {
    if (olderThanDays < 1) {
      throw new Error('olderThanDays must be at least 1');
    }

    const client = getClient(target);
    const categories = getCategories(target);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    const cutoffISO = cutoffDate.toISOString();

    const deletedCounts: Record<string, number> = {};
    let totalDeleted = 0;

    for (const cat of categories) {
      if (!categoryNames.includes(cat.category)) continue;

      for (const table of cat.tables) {
        const beforeCount = await countRows(client, table);

        const { error } = await client
          .from(table)
          .delete()
          .lt('created_at', cutoffISO);

        if (error) {
          console.error(`[DatabaseService] Failed to purge ${table}:`, error.message);
          deletedCounts[table] = 0;
          continue;
        }

        const afterCount = await countRows(client, table);
        const deleted = Math.max(0, beforeCount - afterCount);
        deletedCounts[table] = deleted;
        totalDeleted += deleted;
      }
    }

    return { deletedCounts, totalDeleted };
  }

  /** Full wipe of all non-protected tables. Requires exact confirmation phrase. */
  async fullWipe(target: DatabaseTarget, confirmPhrase: string): Promise<WipeResult> {
    const expectedPhrase = target === 'vaas' ? 'RESET VAAS' : 'RESET MAIN';
    if (confirmPhrase !== expectedPhrase) {
      throw new Error(`Confirmation phrase must be exactly "${expectedPhrase}"`);
    }

    const client = getClient(target);
    const categories = getCategories(target);

    const wipedTables: string[] = [];
    let totalDeleted = 0;

    // Reverse table order so child tables are deleted before parents
    const allTables = categories.flatMap(cat => [...cat.tables]).reverse();

    for (const table of allTables) {
      const beforeCount = await countRows(client, table);

      const { error } = await client
        .from(table)
        .delete()
        .gte('created_at', '1970-01-01T00:00:00.000Z');

      if (error) {
        console.error(`[DatabaseService] Failed to wipe ${table}:`, error.message);
        continue;
      }

      wipedTables.push(table);
      totalDeleted += beforeCount;
    }

    return { wipedTables, totalDeleted };
  }

  /** Get the list of protected tables for a target database */
  getProtectedTables(target: DatabaseTarget): string[] {
    return getProtectedTables(target);
  }

  /** Get category definitions as a map (for frontend display) */
  getCategoryMap(): Record<string, CategoryMapEntry> {
    const map: Record<string, CategoryMapEntry> = {};
    // Build a unified map keyed by category label
    const allLabels = new Set([
      ...VAAS_CATEGORIES.map(c => c.category),
      ...MAIN_CATEGORIES.map(c => c.category),
    ]);

    for (const label of allLabels) {
      const vaasCat = VAAS_CATEGORIES.find(c => c.category === label);
      const mainCat = MAIN_CATEGORIES.find(c => c.category === label);
      map[label] = {
        label,
        risk: vaasCat?.risk ?? mainCat?.risk ?? 'caution',
        vaasTables: vaasCat?.tables ?? [],
        mainTables: mainCat?.tables ?? [],
      };
    }
    return map;
  }

  /** Check if main API database is configured */
  isMainApiConfigured(): boolean {
    return !!mainApiSupabase;
  }
}

export const platformDatabaseService = new PlatformDatabaseService();
