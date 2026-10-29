import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CommerceError, PayPalApiError } from "@agentshelf/core";

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof CommerceError) {
    return NextResponse.json({ error: err.message, code: err.code, details: err.details ?? null }, { status: err.httpStatus });
  }
  if (err instanceof PayPalApiError) {
    return NextResponse.json({ error: err.message, code: "PAYPAL", details: err.body, debug_id: err.debugId ?? null }, { status: 502 });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: "Invalid input", code: "VALIDATION", details: err.flatten() }, { status: 400 });
  }
  if (err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number") {
    const e = err as unknown as { status: number; message?: string };
    return NextResponse.json({ error: e.message ?? "Request failed" }, { status: e.status });
  }
  console.error(err);
  return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error", code: "INTERNAL" }, { status: 500 });
}

/** Parse a JSON body with a zod schema; throws ZodError on failure. */
export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  return schema.parse(body);
}

/** Route handler wrapper: catches and maps errors. */
export function handler<Ctx>(fn: (req: Request, ctx: Ctx) => Promise<Response>): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export type RouteParams<T extends Record<string, string>> = { params: Promise<T> };
