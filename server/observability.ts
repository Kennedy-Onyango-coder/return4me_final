import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type LogLevel = "info" | "warn" | "error";

/** Structured logs intentionally accept only bounded, non-sensitive operational fields. */
export function operationalLog(level: LogLevel, event: string, fields: Record<string, string | number | boolean | null> = {}) {
  const safe = Object.fromEntries(Object.entries(fields).filter(([key, value]) =>
    /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) &&
    (typeof value === "string" ? value.length <= 120 && !/(email|phone|token|secret|password|address|name|payload|body)/i.test(key) : typeof value === "number" || typeof value === "boolean" || value === null)
  ));
  const record = { timestamp: new Date().toISOString(), level, service: "return4me-api", event, ...safe };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function requestObservability(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const route = typeof req.route?.path === "string" ? req.route.path : "unmatched";
    operationalLog(res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", "http.request.completed", {
      requestId, method: req.method, route, statusCode: res.statusCode, durationMs: Number(process.hrtime.bigint() - started) / 1_000_000
    });
  });
  next();
}
