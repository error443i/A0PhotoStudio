/**
 * Converts a Supabase storage URL to a local relative path (/storage/v1/object/public/...)
 * so that client browsers in restricted regions (like Myanmar) fetch images through
 * the Next.js server/proxy without needing a VPN or connecting directly to supabase.co.
 */
export function toProxiedImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // If already a relative storage URL, keep it as is
  if (url.startsWith("/storage/v1/object/public/") || url.startsWith("/storage/")) {
    return url;
  }

  try {
    const candidateUrl = new URL(url);

    // Any Supabase storage URL (original project domain, Cloudflare worker proxy, or custom domain)
    if (candidateUrl.pathname.startsWith("/storage/v1/object/public/")) {
      return candidateUrl.pathname + candidateUrl.search;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      const supabaseOrigin = new URL(supabaseUrl).origin.toLowerCase();
      if (
        candidateUrl.origin.toLowerCase() === supabaseOrigin &&
        candidateUrl.pathname.includes("/storage/")
      ) {
        return candidateUrl.pathname + candidateUrl.search;
      }
    }
  } catch {
    // If url is not an absolute URL, leave it as is
  }

  return url;
}
