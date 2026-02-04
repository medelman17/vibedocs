import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Enable structured logging
  enableLogs: true,

  // Send prompts/outputs to Sentry (useful for debugging AI issues)
  sendDefaultPii: true,

  integrations: [
    // Console integration - captures console.log, console.warn, console.error
    Sentry.consoleLoggingIntegration({
      levels: ["log", "warn", "error"],
    }),
    // Vercel AI SDK integration - tracks LLM calls, tokens, latency
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],

  // Dynamic sampling - capture more of important transactions
  tracesSampler: ({ name, parentSampled }) => {
    // Always skip health checks and internal routes
    if (name.includes("healthcheck") || name.includes("_next")) {
      return 0;
    }
    // Always capture critical paths
    if (name.includes("analyze") || name.includes("inngest")) {
      return 1.0;
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
