import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseImagePattern = supabaseUrl
  ? (() => {
      const url = new URL(supabaseUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTP or HTTPS.");
      }
      return {
        protocol: url.protocol.slice(0, -1) as "http" | "https",
        hostname: url.hostname,
        pathname: "/storage/v1/object/public/**",
      };
    })()
  : null;

const nextConfig: NextConfig = {
  devIndicators: false,
  images: { remotePatterns: supabaseImagePattern ? [supabaseImagePattern] : [] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
