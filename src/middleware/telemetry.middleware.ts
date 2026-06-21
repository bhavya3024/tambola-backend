/**
 * Elysia plugin that wraps each HTTP request in an OpenTelemetry span.
 *
 * Records: http.method, http.route, http.target, http.status_code,
 * and marks spans with error status on 5xx responses.
 */

import { Elysia } from "elysia";
import { trace, SpanStatusCode, SpanKind, context, propagation } from "@opentelemetry/api";

const tracer = trace.getTracer("tambola-backend", "1.0.0");

export const telemetryMiddleware = new Elysia({ name: "telemetry" })
  .derive(({ request }) => {
    // Extract any incoming trace context (for distributed tracing)
    const incomingCtx = propagation.extract(context.active(), request.headers, {
      get(carrier: any, key: string) {
        // Elysia `request.headers` is a Headers object
        return carrier.get(key) ?? undefined;
      },
      keys(carrier: any) {
        return [...carrier.keys()];
      },
    });

    const url = new URL(request.url);

    // Start a new span under the extracted (or root) context
    const span = tracer.startSpan(
      `${request.method} ${url.pathname}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.method": request.method,
          "http.target": url.pathname + url.search,
          "http.url": request.url,
          "http.scheme": url.protocol.replace(":", ""),
          "http.host": url.host,
          "http.user_agent": request.headers.get("user-agent") ?? "",
        },
      },
      incomingCtx
    );

    return {
      _otelSpan: span,
      _otelStartTime: performance.now(),
    };
  })

  .onAfterHandle(({ _otelSpan, _otelStartTime, set, request }) => {
    if (!_otelSpan) return;

    const status = typeof set.status === "number" ? set.status : 200;

    _otelSpan.setAttribute("http.status_code", status);
    _otelSpan.setAttribute(
      "http.duration_ms",
      Math.round(performance.now() - _otelStartTime)
    );

    // Resolve the route pattern if Elysia provides it
    const url = new URL(request.url);
    _otelSpan.setAttribute("http.route", url.pathname);

    if (status >= 500) {
      _otelSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${status}`,
      });
    } else {
      _otelSpan.setStatus({ code: SpanStatusCode.OK });
    }

    _otelSpan.end();
  })

  .onError(({ _otelSpan, _otelStartTime, error, set }) => {
    if (!_otelSpan) return;

    const status = typeof set.status === "number" ? set.status : 500;
    _otelSpan.setAttribute("http.status_code", status);
    _otelSpan.setAttribute(
      "http.duration_ms",
      Math.round(performance.now() - _otelStartTime)
    );

    _otelSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: error?.message ?? "Unknown error",
    });

    _otelSpan.recordException(error);
    _otelSpan.end();
  });
