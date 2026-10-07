import { NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const subPath = resolvedParams.path.join("/");
  const { url } = getSupabasePublicConfig();
  const normalizedUrl = url.replace(/\/$/, "");
  const search = request.nextUrl.search || "";
  const targetUrl = `${normalizedUrl}/storage/v1/object/public/${subPath}${search}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const headers: Record<string, string> = {};
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch) {
      headers["if-none-match"] = ifNoneMatch;
    }

    const response = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 304) {
      return new Response(null, { status: 304 });
    }

    if (!response.ok) {
      return new Response("Not found", { status: response.status });
    }

    const responseHeaders = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);

    const etag = response.headers.get("etag");
    if (etag) responseHeaders.set("etag", etag);

    responseHeaders.set("cache-control", "public, max-age=31536000, immutable");

    return new Response(response.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Error proxying storage image:", error);
    return new Response("Failed to fetch image", { status: 502 });
  }
}
