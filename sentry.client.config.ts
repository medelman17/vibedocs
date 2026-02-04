import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Enable structured logging
  enableLogs: true,

  integrations: [
    // Console integration - captures console.log, console.warn, console.error
    Sentry.consoleLoggingIntegration({
      levels: ["log", "warn", "error"],
    }),
    // Browser tracing - tracks page loads, navigations, and requests
    Sentry.browserTracingIntegration({
      enableLongTask: true,
      enableInp: true,
    }),
  ],

  // Trace propagation to backend APIs (for distributed tracing)
  tracePropagationTargets: ["localhost", /^https:\/\/.*\.vercel\.app\/api/],

  // Dynamic sampling - capture more of important transactions
  tracesSampler: ({ name, parentSampled }) => {
    // Always skip health checks
    if (name.includes("healthcheck") || name.includes("favicon")) {
      return 0;
    }
    // Inherit parent sampling decision for distributed traces
    if (typeof parentSampled === "boolean") {
      return parentSampled;
    }
    // Production: 10%, Development: 100%
    return process.env.NODE_ENV === "production" ? 0.1 : 1.0;
  },

  // Set to false in production to reduce noise
  debug: false,
});
