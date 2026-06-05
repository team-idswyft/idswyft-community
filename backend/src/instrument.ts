import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { scrubSentryEvent } from '@idswyft/shared';

const isProduction = process.env.NODE_ENV === 'production';
const sentryDsn = process.env.SENTRY_DSN;

// Re-export from shared so tests in this package can import from a stable
// path without depending on @idswyft/shared dist resolution at test time.
export { scrubSentryEvent, redactPII, scrubText } from '@idswyft/shared';

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
    sendDefaultPii: false,
    beforeSend(event, hint) {
      // Drop VE_FLOW (SessionFlowError) captures — these fire when a client
      // POSTs a step that's already been processed (typical cause: client read
      // timeout shorter than OCR latency, retry races our state transition).
      // The route already maps these to a useful 409 response, and the
      // idempotency guard in /front-document returns 200 on the common retry
      // path. The Sentry events were noise, not bugs. See NODE-EXPRESS-7.
      const err = hint?.originalException;
      if (err && typeof err === 'object' &&
          (('code' in err && (err as { code?: string }).code === 'VE_FLOW') ||
           ('name' in err && (err as { name?: string }).name === 'SessionFlowError'))) {
        return null;
      }
      return scrubSentryEvent(event);
    },
  });
}
