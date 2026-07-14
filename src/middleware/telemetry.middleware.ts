/**
 * Elysia plugin that enriches the HTTP span created by @sentry/bun's
 * auto-instrumentation with extra attributes and handles error reporting.
 *
 * ⚠️  We do NOT create a new root span here. @sentry/bun already
 *     auto-instruments Bun's HTTP server (sentry.origin: "auto.http.bun.serve")
 *     and produces a root span with the correct route template. Creating our
 *     own root span caused duplicate orphaned spans in Sentry/Dynatrace.
 *
 * What this plugin adds:
 *   - http.duration_ms attribute on the active (auto-instrumented) span
 *   - Sentry.captureException() + OTel error recording on 5xx/unhandled errors
 *
 * Uses `{ as: 'global' }` so hooks propagate to ALL routes in the app.
 */

import { Elysia } from "elysia";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { Sentry } from "../sentry";

export const telemetryMiddleware = new Elysia({ name: "telemetry" })
  .derive({ as: "global" }, () => {
    // Record request start time so we can compute duration in later hooks
    return { _reqStartTime: performance.now() };
  })

  .onAfterHandle({ as: "global" }, ({ _reqStartTime, set }) => {
    // Enrich @sentry/bun's auto-instrumented span with extra attributes
    const span = trace.getActiveSpan();
    if (!span) return;

    const status = typeof set.status === "number" ? set.status : 200;
    const duration = Math.round(performance.now() - (_reqStartTime ?? 0));

    span.setAttribute("http.duration_ms", duration);
    span.setAttribute("http.status_code", status);

    if (status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status}` });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }
  })

  .onError({ as: "global" }, ({ _reqStartTime, error, set }) => {
    // Enrich the active span with error info
    const span = trace.getActiveSpan();

    if (span) {
      const status = typeof set.status === "number" ? set.status : 500;
      const duration = Math.round(performance.now() - (_reqStartTime ?? 0));

      span.setAttribute("http.duration_ms", duration);
      span.setAttribute("http.status_code", status);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as any)?.message ?? "Unknown error",
      });
      span.recordException(error as any);
    }

    // Report to Sentry for error alerting and issue grouping
    Sentry.captureException(error, {
      tags: {
        layer: "http-middleware",
        "http.status": typeof set.status === "number" ? set.status : 500,
      },
    });
  });
