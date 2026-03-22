function parseMonitoredServices(): { id: string; name: string; healthUrl: string }[] {
  const raw = process.env.MONITORED_SERVICES;
  if (!raw) {
    return [
      { id: 'main_api', name: 'Main API', healthUrl: 'http://localhost:3001/health' },
      { id: 'vaas_api', name: 'VaaS API', healthUrl: 'http://localhost:3002/api/health' },
    ];
  }
  try {
    return JSON.parse(raw);
  } catch {
    console.error('[Config] Failed to parse MONITORED_SERVICES, using empty list');
    return [];
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3003'),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabase: {
    url: process.env.STATUS_SUPABASE_URL || '',
    serviceRoleKey: process.env.STATUS_SUPABASE_SERVICE_ROLE_KEY || '',
    directUrl: process.env.STATUS_SUPABASE_DIRECT_URL || '',
  },
  serviceToken: process.env.STATUS_SERVICE_TOKEN || 'dev-status-token',
  monitoredServices: parseMonitoredServices(),
  vaas: {
    apiUrl: process.env.VAAS_API_URL || 'http://localhost:3002',
    serviceToken: process.env.IDSWYFT_SERVICE_TOKEN || 'dev-service-token',
  },
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '60000'),
  cleanupIntervalHours: parseInt(process.env.CLEANUP_INTERVAL_HOURS || '24'),
  retentionDays: parseInt(process.env.RETENTION_DAYS || '30'),
  incidentRetentionDays: parseInt(process.env.INCIDENT_RETENTION_DAYS || '90'),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5174,http://localhost:3001,https://status.idswyft.app').split(','),
};

export default config;
