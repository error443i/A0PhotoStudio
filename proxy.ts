import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseUrlObject = supabaseUrl ? new URL(supabaseUrl) : null;
  const supabaseOrigin = supabaseUrlObject?.origin ?? "";
  const supabaseWebSocketOrigin = supabaseUrlObject
    ? `${supabaseUrlObject.protocol === "https:" ? "wss:" : "ws:"}//${supabaseUrlObject.host}`
    : "";
  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabaseOrigin} https://*.supabase.co https://images.unsplash.com`,
    `connect-src 'self' ${supabaseOrigin} ${supabaseWebSocketOrigin} https://*.supabase.co wss://*.supabase.co`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
