import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Enable structured logging
  enableLogs: true,

  // Send prompts/outputs to Sentry
  sendDefaultPii: true,

  integrations: [
    // Console integration - captures console.log, console.warn, console.error
    Sentry.consoleLoggingIntegration({
      levels: ["log", "warn", "error"],
    }),
    // Vercel AI SDK integration (must be explicit for edge runtime)
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],

  // Dynamic sampling
  tracesSampler: ({ parentSampled }) => {
    if (typeof parentSampled === "boolean") {
      return parentSampled;
    }
    return process.env.NODE_ENV === "production" ? 0.1 : 1.0;
  },

  // Set to false in production to reduce noise
  debug: false,
});
