/**
 * Mongoose global plugin that creates Sentry child spans for every DB operation.
 *
 * Why not @opentelemetry/instrumentation-mongoose or Sentry.mongooseIntegration()?
 * Both rely on patching Mongoose at module-load time via Node.js require() hooks.
 * Bun's ESM runtime does not implement those hooks, so they silently no-op.
 *
 * This plugin hooks into Mongoose's own pre/post middleware system instead,
 * which is pure JavaScript and works correctly in any runtime.
 *
 * Register by calling registerMongooseTracing() AFTER mongoose is imported
 * (i.e. after connectDB() or anywhere in database/connection.ts).
 */

import mongoose from "mongoose";
import * as Sentry from "@sentry/bun";

/** Query-level operations (this = Query instance in hooks) */
const QUERY_OPS = [
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "replaceOne",
  "count",
  "countDocuments",
  "estimatedDocumentCount",
  "distinct",
] as const;

/** Document-level operations (this = Document instance in hooks) */
const DOC_OPS = ["save", "deleteOne"] as const;

/** Aggregate operations */
const AGG_OPS = ["aggregate"] as const;

export function registerMongooseTracing() {
  // ── Query middleware ────────────────────────────────────────────────────────
  mongoose.plugin((schema) => {
    for (const op of QUERY_OPS) {
      schema.pre(op as any, function (this: any) {
        const collectionName =
          (this as any).mongooseCollection?.name ??
          (this as any).model?.collection?.name ??
          "unknown";

        this.__sentrySpan = Sentry.startInactiveSpan({
          name: `${collectionName}.${op}`,
          forceTransaction: false,
          attributes: {
            "db.system": "mongodb",
            "db.operation": op,
            "db.collection": collectionName,
          },
        });
      });

      schema.post(op as any, function (this: any) {
        this.__sentrySpan?.end();
      });
    }

    // ── Document save / deleteOne ──────────────────────────────────────────
    for (const op of DOC_OPS) {
      schema.pre(op as any, function (this: any) {
        const collectionName =
          this.constructor?.collection?.name ?? "unknown";

        this.__sentrySpan = Sentry.startInactiveSpan({
          name: `${collectionName}.${op}`,
          forceTransaction: false,
          attributes: {
            "db.system": "mongodb",
            "db.operation": op,
            "db.collection": collectionName,
          },
        });
      });

      schema.post(op as any, function (this: any) {
        this.__sentrySpan?.end();
      });
    }

    // ── Aggregate ──────────────────────────────────────────────────────────
    for (const op of AGG_OPS) {
      schema.pre(op as any, function (this: any) {
        const collectionName =
          (this as any)._model?.collection?.name ?? "unknown";

        this.__sentrySpan = Sentry.startInactiveSpan({
          name: `${collectionName}.${op}`,
          forceTransaction: false,
          attributes: {
            "db.system": "mongodb",
            "db.operation": op,
            "db.collection": collectionName,
          },
        });
      });

      schema.post(op as any, function (this: any) {
        this.__sentrySpan?.end();
      });
    }
  });

  console.log("🍃 Mongoose tracing plugin registered");
}
