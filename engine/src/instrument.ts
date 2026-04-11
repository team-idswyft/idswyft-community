import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const isProduction = process.env.NODE_ENV === 'production';
const sentryDsn = process.env.SENTRY_DSN;

if (isProduction && sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    integrations: [
      nodeProfilingIntegration(),
    ],
    enableLogs: true,
    tracesSampleRate: 1.0,
    profileSessionSampleRate: 1.0,
    profileLifecycle: 'trace',
    sendDefaultPii: true,
  });
}
