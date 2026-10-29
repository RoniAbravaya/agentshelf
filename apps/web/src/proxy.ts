import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/sell", "/dashboard", "/inbox", "/settings", "/orders"];
const SESSION_COOKIE = "as_session";

/** Redirect signed-out visitors away from account pages. Authorization itself happens in each handler. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // PayPal sends the buyer back to /orders/{id}/return after approval; that handler is keyed by the PayPal token, not the session.
  if (/^\/orders\/[^/]+\/return$/.test(pathname)) return NextResponse.next();
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (needsAuth && !request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/sell/:path*", "/dashboard/:path*", "/inbox/:path*", "/settings/:path*", "/orders/:path*"],
};
