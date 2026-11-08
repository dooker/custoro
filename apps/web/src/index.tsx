import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
import Loader from './components/_shared/Loader/Loader';
import { QueryClient, QueryClientConfig, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { scrubSentryPayload } from './utils/sentryScrub';
import { releaseName } from './utils/buildInfo';

// Error tracking is enabled only when VITE_SENTRY_DSN is set at build time
if (import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        // Errors are grouped by the build they happened in, named like the API's
        release: releaseName(__APP_VERSION__, __APP_BUILD__),
        integrations: [
            Sentry.browserTracingIntegration(),
            Sentry.replayIntegration({ beforeAddRecordingEvent: scrubSentryPayload }),
        ],
        // Keeps password reset tokens and public PDF links out of everything sent to Sentry
        beforeSend: scrubSentryPayload,
        beforeSendTransaction: scrubSentryPayload,
        beforeBreadcrumb: scrubSentryPayload,
        // A tenth of the page loads in production, like the API (SENTRY_TRACES_SAMPLE_RATE)
        tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
        // Replays (text and inputs masked, Sentry's default) only of sessions that had an error:
        // customer and invoice data stay off Sentry otherwise
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 1.0,
        // Traces follow requests to the API of this origin (/api), the default; the example
        // host that was here sent trace headers to any localhost
    });
}

const queryConfig: QueryClientConfig = {
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5,
        },
    },
};

const queryClient = new QueryClient(queryConfig);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
    <Suspense fallback={<Loader />}>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </Suspense>
);
