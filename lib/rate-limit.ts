import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitOptions = {
  scope: string;
  requests: number;
  window: `${number} m`;
};

const limiters = new Map<string, Ratelimit>();
let redisClient: Redis | undefined;

function getLimiter(options: RateLimitOptions, redis: Redis) {
  const key = `${options.scope}:${options.requests}:${options.window}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(options.requests, options.window),
      prefix: `photo-studio:${options.scope}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

function getClientIp(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = realIp || forwardedIp;
  return ip && isIP(ip) ? ip : null;
}

export async function rateLimitRequest(
  request: Request,
  options: RateLimitOptions,
): Promise<Response | null> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!redisUrl || !redisToken) {
    if (process.env.NODE_ENV === "development") return null;
    console.error("Distributed API rate limiting is not configured.");
    return Response.json(
      { error: "This service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const ip = getClientIp(request);
  if (!ip) {
    console.error("Unable to determine the client IP for API rate limiting.");
    return Response.json(
      { error: "This service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    redisClient ??= new Redis({ url: redisUrl, token: redisToken });
    const key = createHash("sha256").update(ip).digest("hex");
    const result = await getLimiter(options, redisClient).limit(key);
    if (result.success) return null;

    const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    return Response.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(retryAfter),
        },
      },
    );
  } catch {
    console.error("Distributed API rate limiting request failed.");
    return Response.json(
      { error: "This service is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
