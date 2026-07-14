/**
 * Sentry SDK initialisation for the Bun runtime.
 *
 * ⚠️  This file MUST be imported before any other application code
 *     (including OpenTelemetry) so that Sentry can catch early errors
 *     and instrument the runtime before other patches are applied.
 *
 * Environment variables consumed:
 *   SENTRY_DSN       – Sentry Data Source Name (project ingest URL)
 *   NODE_ENV         – e.g. "development" | "production"
 *   OTEL_SERVICE_NAME – (optional) defaults to "tambola-backend"
 */

import * as Sentry from "@sentry/bun";

const SENTRY_DSN = process.env.SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV || "development";
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "tambola-backend";

if (!SENTRY_DSN) {
  console.warn(
    "⚠️  Sentry: SENTRY_DSN not set. Error reporting and tracing disabled."
  );
}

Sentry.init({
  dsn: SENTRY_DSN,
  environment: ENVIRONMENT,
  release: `${SERVICE_NAME}@1.0.0`,

  // Performance tracing — 100% in dev, 10% in production
  tracesSampleRate: ENVIRONMENT === "production" ? 0.1 : 1.0,

  // Sentry structured logging bridge (SDK ≥ 9.x / v10.x experiment flag)
  _experiments: { enableLogs: true },

  // ⚠️ We run our own OpenTelemetry SDK (otel.ts / Dynatrace).
  // Prevent Sentry from registering a second set of OTel providers which
  // would cause "Attempted duplicate registration" errors.
  // Sentry will still read trace/span context from the OTel globals our SDK sets.
  skipOpenTelemetrySetup: true,

  integrations: [
    // Collects Bun runtime health metrics: memory, CPU, event-loop lag
    Sentry.bunRuntimeMetricsIntegration(),
  ],
});

console.log(
  `🛡️  Sentry initialised (service=${SERVICE_NAME}, env=${ENVIRONMENT}, dsn=${SENTRY_DSN ? "set" : "not set"})`
);

// ── Graceful shutdown ──────────────────────────────────────────────────
// Flush any queued events before the process exits so nothing is lost.
const flushSentry = async () => {
  try {
    await Sentry.flush(2_000); // wait up to 2 s for in-flight events
  } catch {
    // Suppress – we're shutting down anyway
  }
};

process.on("SIGTERM", flushSentry);
process.on("SIGINT", flushSentry);

// Re-export for use in error handlers without requiring a second import
export { Sentry };
