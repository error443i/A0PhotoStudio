import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  detectImageMimeType,
  getExtensionForMime,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/image-validation";
import { rateLimitRequest } from "@/lib/rate-limit";
import { getSupabasePublicConfig } from "@/lib/supabase";
import { verifyAdminSession } from "@/lib/supabase-server";
import { toProxiedImageUrl } from "@/lib/image-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadSchema = z.discriminatedUnion("purpose", [
  z.object({
    purpose: z.literal("story-photo"),
    storyId: z.string().uuid(),
    file: z.instanceof(File),
  }).strict(),
  z.object({
    purpose: z.literal("hero-background"),
    file: z.instanceof(File),
  }).strict(),
]);

function jsonResponse(body: { error: string } | { imageUrl: string }, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function handleAdminUpload(request: Request) {
  const rateLimitResponse = await rateLimitRequest(request, {
    scope: "admin-image-upload",
    requests: 30,
    window: "1 m",
  });
  if (rateLimitResponse) return rateLimitResponse;

  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > MAX_IMAGE_SIZE_BYTES + 65_536)
  ) {
    return jsonResponse({ error: "The image upload request is too large." }, 413);
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return jsonResponse({ error: "A multipart image upload is required." }, 415);
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];

  const { url, anonKey } = getSupabasePublicConfig();

  if (token) {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) {
      return jsonResponse({ error: "Your admin session has expired. Sign in again." }, 401);
    }

    const { data: adminRecord, error: adminError } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (adminError) {
      console.error("Unable to verify admin access for image upload.");
      return jsonResponse({ error: "Unable to verify admin access." }, 500);
    }
    if (!adminRecord) return jsonResponse({ error: "Administrator access is required." }, 403);
  } else {
    const authResult = await verifyAdminSession();
    if (authResult.status === "signed-out") {
      return jsonResponse({ error: "Sign in as an administrator to upload images." }, 401);
    }
    if (authResult.status !== "admin") {
      return jsonResponse({ error: "Administrator access is required." }, 403);
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ error: "The upload form is invalid." }, 400);
  }

  const entries = Array.from(formData.entries());
  if (entries.some(([key]) => formData.getAll(key).length !== 1)) {
    return jsonResponse({ error: "The upload form contains duplicate fields." }, 400);
  }

  const parsed = uploadSchema.safeParse(Object.fromEntries(entries));
  if (!parsed.success) return jsonResponse({ error: "The upload form is invalid." }, 400);

  const { file, purpose } = parsed.data;
  if (file.size === 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
    return jsonResponse({ error: "Images must be no larger than 20 MB." }, 413);
  }

  let bytes = new Uint8Array(await file.arrayBuffer());
  let contentType: string | null = detectImageMimeType(bytes, file.name || file.type);
  if (!contentType) {
    return jsonResponse({ error: "Unsupported image format. Please upload a valid image file." }, 415);
  }

  let extension = getExtensionForMime(contentType, file.name);

  if (contentType === "image/tiff") {
    try {
      const sharp = (await import("sharp")).default;
      const converted = await sharp(bytes).webp({ quality: 90 }).toBuffer();
      bytes = new Uint8Array(converted);
      contentType = "image/webp";
      extension = "webp";
    } catch (e) {
      console.warn("Could not convert TIFF with sharp, saving as original:", e);
    }
  } else if (contentType === "image/heic" || contentType === "image/heif") {
    try {
      const sharp = (await import("sharp")).default;
      const converted = await sharp(bytes).webp({ quality: 90 }).toBuffer();
      bytes = new Uint8Array(converted);
      contentType = "image/webp";
      extension = "webp";
    } catch {
      // Keep original HEIC
    }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    console.error("Supabase service role key is not configured for admin image uploads.");
    return jsonResponse({ error: "Image upload service is not configured." }, 500);
  }
  const adminSupabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let storyId: string | undefined;
  if (purpose === "story-photo") {
    storyId = parsed.data.storyId;
    const { data: story, error: storyError } = await adminSupabase
      .from("featured_stories")
      .select("id")
      .eq("id", storyId)
      .maybeSingle();
    if (storyError) {
      console.error("Unable to verify story for image upload.");
      return jsonResponse({ error: "Unable to verify the selected collection." }, 500);
    }
    if (!story) return jsonResponse({ error: "The selected collection was not found." }, 404);
  }

  const storagePath = purpose === "hero-background"
    ? `hero/${crypto.randomUUID()}.${extension}`
    : `${storyId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await adminSupabase.storage
    .from("portfolio-photos")
    .upload(storagePath, bytes, { contentType, upsert: false });

  if (uploadError) {
    console.error("Unable to store validated admin image.");
    return jsonResponse({ error: "Unable to store the image." }, 500);
  }

  const { data: publicUrlData } = adminSupabase.storage
    .from("portfolio-photos")
    .getPublicUrl(storagePath);

  if (purpose === "story-photo") {
    const { data: lastPhoto, error: orderError } = await adminSupabase
      .from("story_photos")
      .select("sort_order")
      .eq("story_id", storyId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orderError) {
      await adminSupabase.storage.from("portfolio-photos").remove([storagePath]);
      console.error("Unable to read photo order for image upload.");
      return jsonResponse({ error: "Unable to save the image to the selected collection." }, 500);
    }

    const { error: insertError } = await adminSupabase.from("story_photos").insert({
      story_id: storyId,
      image_url: publicUrlData.publicUrl,
      storage_path: storagePath,
      sort_order: (lastPhoto?.sort_order ?? 0) + 1,
    });
    if (insertError) {
      await adminSupabase.storage.from("portfolio-photos").remove([storagePath]);
      console.error("Unable to save photo metadata.");
      return jsonResponse({ error: "Unable to save the image to the selected collection." }, 500);
    }

    return jsonResponse({ imageUrl: toProxiedImageUrl(publicUrlData.publicUrl) ?? publicUrlData.publicUrl });
  }

  const { data: previousSetting, error: settingsError } = await adminSupabase
    .from("site_settings")
    .select("storage_path")
    .eq("key", "hero_background")
    .maybeSingle();
  if (settingsError) {
    await adminSupabase.storage.from("portfolio-photos").remove([storagePath]);
    console.error("Unable to load current homepage background.");
    return jsonResponse({ error: "Unable to update the homepage background." }, 500);
  }

  const { error: settingsUpdateError } = await adminSupabase.from("site_settings").upsert({
    key: "hero_background",
    value: publicUrlData.publicUrl,
    storage_path: storagePath,
  });
  if (settingsUpdateError) {
    await adminSupabase.storage.from("portfolio-photos").remove([storagePath]);
    console.error("Unable to save homepage background.");
    return jsonResponse({ error: "Unable to update the homepage background." }, 500);
  }

  if (previousSetting?.storage_path) {
    const { error: removeError } = await adminSupabase.storage
      .from("portfolio-photos")
      .remove([previousSetting.storage_path]);
    if (removeError) console.error("Unable to delete previous homepage background.");
  }

  return jsonResponse({ imageUrl: toProxiedImageUrl(publicUrlData.publicUrl) ?? publicUrlData.publicUrl });
}

export async function POST(request: Request) {
  try {
    return await handleAdminUpload(request);
  } catch (uploadError) {
    console.error(
      "Unexpected admin image upload failure.",
      uploadError instanceof Error ? uploadError.name : "Unknown error",
    );
    return jsonResponse({ error: "Unable to process the image upload." }, 500);
  }
}
