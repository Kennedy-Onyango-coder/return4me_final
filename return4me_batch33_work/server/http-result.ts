/**
 * Typed outcome for route handlers that do their work inside a `db.transaction` callback.
 *
 * Background — why an explicit discriminant is required
 * -----------------------------------------------------
 * Batch 4 handlers returned ad-hoc object literals from the transaction callback, e.g.
 *
 *   if (!report) return { error: "Report not found", status: 404 as const };
 *   return { assignment: created, reporterId: report.reporterId };
 *
 * and then narrowed with `if ("error" in result)`. That is unsound: because the callback's
 * return type is inferred through the generic `db.transaction<T>`, TypeScript normalises the
 * object-literal union into
 *
 *   { error: string; status: 404; reporterId?: undefined }
 *     | { assignment: Agent; reporterId: string; error?: undefined; status?: undefined }
 *
 * Every member therefore *declares* every key, so `"error" in result` matches both members and
 * `result.status` widens to `404 | undefined` (and to `string | number` where the success
 * payload has its own `status` field). `res.status()` then rejects the value.
 *
 * `RouteResult` fixes this at the source: success and failure are separate, explicitly declared
 * types discriminated by the literal `ok` field, so `isRouteFailure()` removes the failure
 * member completely and `result.status` stays a strict numeric HTTP status. Error messages stay
 * in their own `error` field and are never coerced into status codes.
 */

/** Numeric HTTP status values a handler may reject with. Deliberately a closed union. */
export type HttpErrorStatus =
  | 400 // malformed, missing or unparsable input
  | 401 // authentication/verification required
  | 403 // authenticated but not permitted
  | 404 // resource not found
  | 409 // workflow conflict or invalid state transition
  | 422 // semantically invalid domain input
  | 423 // workflow gate is not yet enabled
  | 429; // rate limited

export type RouteSuccess<T> = { readonly ok: true; readonly value: T };

export type RouteFailure = {
  readonly ok: false;
  /** Numeric HTTP status; never a message and never `undefined`. */
  readonly status: HttpErrorStatus;
  /** User-facing error message; deliberately separate from `status`. */
  readonly error: string;
};

export type RouteResult<T> = RouteSuccess<T> | RouteFailure;

/** Builds a success result. */
export function succeed<T>(value: T): RouteSuccess<T> {
  return { ok: true, value };
}

/** Builds a failure result. The status must be a real numeric HTTP status. */
export function fail(status: HttpErrorStatus, error: string): RouteFailure {
  return { ok: false, status, error };
}

/** Narrows a `RouteResult<T>` to its failure member. */
export function isRouteFailure<T>(result: RouteResult<T>): result is RouteFailure {
  return !result.ok;
}
