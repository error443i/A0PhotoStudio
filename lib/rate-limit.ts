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
const localRequests = new Map<string, { count: number; expiresAt: number }>();
let warnedAboutLocalRateLimit = false;

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
  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const ip = realIp || forwardedIp;
  return ip && isIP(ip) ? ip : null;
}

function localRateLimit(
  ip: string,
  options: RateLimitOptions,
): Response | null {
  const windowMinutes = Number(options.window.match(/^(\d+) m$/)?.[1]);
  if (!Number.isSafeInteger(windowMinutes) || windowMinutes < 1) {
    throw new Error("Invalid rate-limit window.");
  }

  const now = Date.now();
  const windowMs = windowMinutes * 60_000;
  const key = `${options.scope}:${createHash("sha256").update(ip).digest("hex")}`;
  const current = localRequests.get(key);
  if (!current || current.expiresAt <= now) {
    if (localRequests.size >= 10_000) {
      for (const [storedKey, entry] of localRequests) {
        if (entry.expiresAt <= now) localRequests.delete(storedKey);
      }
      if (localRequests.size >= 10_000) {
        return Response.json(
          { error: "Too many requests. Please try again shortly." },
          { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
        );
      }
    }
    localRequests.set(key, { count: 1, expiresAt: now + windowMs });
    return null;
  }

  if (current.count < options.requests) {
    current.count += 1;
    return null;
  }

  return Response.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(Math.max(1, Math.ceil((current.expiresAt - now) / 1000))),
      },
    },
  );
}

export async function rateLimitRequest(
  request: Request,
  options: RateLimitOptions,
): Promise<Response | null> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!redisUrl || !redisToken) {
    if (process.env.NODE_ENV === "production" && !warnedAboutLocalRateLimit) {
      console.warn("Upstash is not configured; using per-instance API rate limits.");
      warnedAboutLocalRateLimit = true;
    }

    return localRateLimit(getClientIp(request) ?? "unknown", options);
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
    console.error("Distributed API rate limiting request failed; using per-instance limits.");
    return localRateLimit(getClientIp(request) ?? "unknown", options);
  }
}
