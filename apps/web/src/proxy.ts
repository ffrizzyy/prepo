import { NextResponse, type NextRequest } from "next/server";

/**
 * A per-request nonce for the CSP.
 *
 * The security headers live in `next.config.ts`, but a nonce cannot: it must be
 * different for every request, and a header written at build time would be the
 * same nonce on every page. This proxy generates one, puts it in the CSP on the
 * request and the response, and lets Next attach it to its own scripts.
 *
 * Every page is rendered for the request because the root layout reads the
 * nonce with `headers()`. That is the trade: no static HTML for the marketing
 * pages, but `script-src` no longer needs `'unsafe-inline'`, which is the one
 * warning securityheaders.com has against this origin.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    // `strict-dynamic` lets the nonce-bearing Next bootstrap load the chunks it
    // needs; a string injected into the page cannot run because it has no
    // nonce. Development needs eval for React's debugging stack.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // Style attributes (progress bars, charts) are set by React on the client;
    // there is no user-controlled style string, and style injection cannot run
    // script. The scanner's A+ cap is script-src, not style-src.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Documents and API answers, not the immutable build output. Prefetches
     * carry an RSC payload, not an HTML document, so they do not need a nonce.
     */
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
