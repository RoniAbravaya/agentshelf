/** Typed errors so API routes and MCP tools can map them to status codes / tool errors. */
export class CommerceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "UNAUTHENTICATED"
      | "VALIDATION"
      | "CONFLICT"
      | "RESERVED"
      | "PAYPAL_NOT_CONFIGURED"
      | "PAYPAL"
      | "POLICY_BLOCKED"
      | "AI_REJECTED",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CommerceError";
  }
  get httpStatus(): number {
    switch (this.code) {
      case "NOT_FOUND":
        return 404;
      case "FORBIDDEN":
        return 403;
      case "UNAUTHENTICATED":
        return 401;
      case "VALIDATION":
      case "AI_REJECTED":
        return 400;
      case "CONFLICT":
      case "RESERVED":
        return 409;
      case "POLICY_BLOCKED":
        return 422;
      case "PAYPAL_NOT_CONFIGURED":
        return 503;
      case "PAYPAL":
        return 502;
    }
  }
}

export const notFound = (what: string) => new CommerceError(`${what} not found`, "NOT_FOUND");
export const forbidden = (msg = "Not allowed") => new CommerceError(msg, "FORBIDDEN");
export const unauthenticated = (msg = "Sign in required") => new CommerceError(msg, "UNAUTHENTICATED");
export const validation = (msg: string, details?: unknown) => new CommerceError(msg, "VALIDATION", details);
export const conflict = (msg: string) => new CommerceError(msg, "CONFLICT");
