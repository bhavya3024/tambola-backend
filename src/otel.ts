/**
 * OpenTelemetry SDK initialisation for Dynatrace.
 *
 * ⚠️  This file MUST be imported before any other application code
 *     so that instrumentations can monkey-patch modules early.
 *
 * Environment variables consumed:
 *   DT_OTLP_ENDPOINT  – e.g. https://{env-id}.live.dynatrace.com/api/v2/otlp
 *   DT_API_TOKEN      – Dynatrace API token with ingest scopes
 *   OTEL_SERVICE_NAME  – (optional) defaults to "tambola-backend"
 */

import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";

// Enable OTEL diagnostic logging so export errors are visible
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from "@opentelemetry/semantic-conventions";

import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";

import { SimpleSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";

import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { MongooseInstrumentation } from "@opentelemetry/instrumentation-mongoose";

// ── Configuration ──────────────────────────────────────────────────────
const DT_ENDPOINT = (process.env.DT_OTLP_ENDPOINT || "").replace(/\/+$/, ""); // strip trailing slash
const DT_TOKEN = process.env.DT_API_TOKEN;
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "tambola-backend";
const ENVIRONMENT = process.env.NODE_ENV || "development";

const hasDynatrace = Boolean(DT_ENDPOINT && DT_TOKEN);

if (!hasDynatrace) {
  console.warn(
    "⚠️  OpenTelemetry: DT_OTLP_ENDPOINT or DT_API_TOKEN not set. " +
      "Traces will be logged to console in development. " +
      "Set both env vars to export to Dynatrace."
  );
}

// ── Auth headers for Dynatrace OTLP ingestion ──────────────────────────
const dtHeaders = hasDynatrace
  ? { Authorization: `Api-Token ${DT_TOKEN}` }
  : undefined;

// ── Resource: identifies this service in Dynatrace ─────────────────────
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: SERVICE_NAME,
  [ATTR_SERVICE_VERSION]: "1.0.0",
  [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: ENVIRONMENT,
});

// ── Trace exporter ─────────────────────────────────────────────────────
const traceExporter = hasDynatrace
  ? new OTLPTraceExporter({
      url: `${DT_ENDPOINT}/v1/traces`,
      headers: dtHeaders,
    })
  : undefined;

// SimpleSpanProcessor exports each span immediately (BatchSpanProcessor timers
// don't fire reliably in Bun). Console fallback for local dev.
const spanProcessor = traceExporter
  ? new SimpleSpanProcessor(traceExporter)
  : new SimpleSpanProcessor(new ConsoleSpanExporter());

// ── Metric exporter ────────────────────────────────────────────────────
const metricReaders = hasDynatrace
  ? [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${DT_ENDPOINT}/v1/metrics`,
          headers: dtHeaders,
        }),
        exportIntervalMillis: 60_000, // export every 60 s
      }),
    ]
  : undefined;

// ── Log exporter ───────────────────────────────────────────────────────
const logProcessor = hasDynatrace
  ? new BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: `${DT_ENDPOINT}/v1/logs`,
        headers: dtHeaders,
      })
    )
  : undefined;

// ── SDK setup ──────────────────────────────────────────────────────────
const sdk = new NodeSDK({
  resource,
  spanProcessors: [spanProcessor],
  ...(metricReaders ? { metricReaders } : {}),
  ...(logProcessor ? { logRecordProcessors: [logProcessor] } : {}),
  instrumentations: [
    new HttpInstrumentation(),
    new MongooseInstrumentation(),
  ],
});

sdk.start();
console.log(
  `📡 OpenTelemetry initialised (service=${SERVICE_NAME}, dynatrace=${hasDynatrace ? "enabled" : "disabled"})`
);
if (hasDynatrace) {
  console.log(`📡 OTLP trace endpoint: ${DT_ENDPOINT}/v1/traces`);
  console.log(`📡 OTLP token prefix: ${DT_TOKEN?.substring(0, 12)}…`);
}


// ── Graceful shutdown ──────────────────────────────────────────────────
const shutdown = async () => {
  console.log("📡 OpenTelemetry shutting down…");
  try {
    await sdk.shutdown();
    console.log("📡 OpenTelemetry shut down successfully");
  } catch (err) {
    console.error("📡 OpenTelemetry shutdown error:", err);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
