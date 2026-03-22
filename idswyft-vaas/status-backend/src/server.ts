import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import { connectDb } from './config/database.js';
import healthRoute from './routes/health.js';
import publicStatusRoute from './routes/publicStatus.js';
import publicIncidentsRoute from './routes/publicIncidents.js';
import adminIncidentsRoute from './routes/adminIncidents.js';
import { healthPoller } from './services/healthPoller.js';
import { dataCleanup } from './services/dataCleanup.js';

const app = express();

// Middleware
app.use(cors({ origin: config.corsOrigins, credentials: false }));
app.use(express.json());

// Routes
app.use('/health', healthRoute);
app.use('/api/status', publicStatusRoute);
app.use('/api/incidents', publicIncidentsRoute);
app.use('/api/admin/incidents', adminIncidentsRoute);

// Start
async function start() {
  const connected = await connectDb();
  if (!connected) {
    console.error('[Server] Cannot start without database connection');
    process.exit(1);
  }

  // Start background services
  healthPoller.start();
  dataCleanup.start();

  app.listen(config.port, () => {
    console.log(`[Server] Status backend running on port ${config.port}`);
    console.log(`[Server] Monitoring ${config.monitoredServices.length} services`);
  });
}

start().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});

export default app;
