import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Opt out of bundling packages that use Node-only APIs or break when bundled
  // (e.g. pdfjs-dist worker path resolves wrong in Turbopack server bundle)
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],

  // Memory optimization: dispose inactive pages faster, keep fewer buffered
  onDemandEntries: {
    maxInactiveAge: 15 * 1000, // 15s (default 25s)
    pagesBufferLength: 2,      // Keep only 2 pages buffered
  },

  experimental: {
    // Reduce max memory usage during webpack compilation
    webpackMemoryOptimizations: true,

    // Optimize imports for heavy packages not in default list
    // Note: lucide-react, recharts, date-fns are already optimized by default
    optimizePackageImports: [
      "shiki",
      "@xyflow/react",
      "motion",
      "@rive-app/react-webgl2",
      // Radix UI primitives (not in default list)
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-icons",
      "@radix-ui/react-label",
      "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
    ],
  },
};

// Skip Sentry in development for faster HMR
const sentryConfig = {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "edelprojects",

  project: "sentry-vibedocs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
};

// Disable Sentry wrapper in development for faster compilation
export default process.env.NODE_ENV === "development"
  ? nextConfig
  : withSentryConfig(nextConfig, sentryConfig);
