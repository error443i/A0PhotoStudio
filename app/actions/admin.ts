"use server";

import { revalidatePath } from "next/cache";
import {
  createServerSupabaseClient,
  createAdminSupabaseClient,
  verifyAdminSession,
  isMissingSchemaTable,
} from "@/lib/supabase-server";
import {
  detectImageMimeType,
  getExtensionForMime,
  MAX_IMAGE_SIZE_BYTES,
} from "@/lib/image-validation";
import { toProxiedImageUrl } from "@/lib/image-url";
import type { TelegramPackage } from "@/lib/telegram-packages";

export type AdminStoryPhoto = {
  id: string;
  image_url: string;
  storage_path: string | null;
  sort_order: number;
};

export type AdminStory = {
  id: string;
  title: string;
  category: string;
  year: string;
  sort_order: number;
  story_photos: AdminStoryPhoto[];
};

export type AdminHeroBackground = {
  value: string;
  storage_path: string | null;
} | null;

export type AdminSessionState =
  | { status: "admin"; user: { id: string; email?: string } }
  | { status: "not-admin"; user?: { id: string; email?: string }; error?: string }
  | { status: "signed-out"; error?: string }
  | { status: "setup-error"; error: string };

function formatErrorMessage(error: unknown): string {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error);

  if (
    msg.includes("fetch failed") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.toLowerCase().includes("aborted") ||
    msg.toLowerCase().includes("abort")
  ) {
    return "Unable to connect to Supabase (connection timed out). Your internet cannot reach supabase.co directly. Please enable your VPN or use a Cloudflare Worker reverse proxy.";
  }
  return msg;
}

/**
 * Checks the current session and whether the user has administrator privileges.
 */
export async function getAdminSessionAction(): Promise<AdminSessionState> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status === "admin") {
      return {
        status: "admin",
        user: { id: authResult.user.id, email: authResult.user.email },
      };
    }
    if (authResult.status === "not-admin") {
      return {
        status: "not-admin",
        user: { id: authResult.user.id, email: authResult.user.email },
        error: authResult.error,
      };
    }
    if (authResult.status === "setup-error") {
      return { status: "setup-error", error: authResult.error };
    }
    return { status: "signed-out" };
  } catch (error) {
    if (isMissingSchemaTable(error)) {
      return {
        status: "setup-error",
        error:
          "Required admin tables are missing from Supabase. Run supabase migrations in Supabase SQL Editor.",
      };
    }
    return { status: "signed-out", error: formatErrorMessage(error) };
  }
}

/**
 * Signs in as an administrator using email and password.
 */
export async function loginAdminAction(input: {
  email: string;
  password: string;
}): Promise<{ success: boolean; status: AdminSessionState["status"]; error?: string }> {
  try {
    const email = input.email.trim();
    const password = input.password;
    if (!email || !password) {
      return { success: false, status: "signed-out", error: "Email and password are required." };
    }

    const client = await createServerSupabaseClient();
    const { data: loginData, error: loginError } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError || !loginData.user) {
      return {
        success: false,
        status: "signed-out",
        error: loginError?.message || "Invalid login credentials.",
      };
    }

    const user = loginData.user;
    const { data: adminRecord, error: adminError } = await client
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) {
      if (isMissingSchemaTable(adminError)) {
        return {
          success: false,
          status: "setup-error",
          error:
            "Required admin tables are missing from Supabase. Run migrations in Supabase SQL Editor.",
        };
      }
      return {
        success: false,
        status: "not-admin",
        error: `Unable to verify administrator privileges: ${adminError.message}`,
      };
    }

    if (!adminRecord) {
      await client.auth.signOut();
      return {
        success: false,
        status: "not-admin",
        error: "This account is not on the authorized administrator list.",
      };
    }

    return { success: true, status: "admin" };
  } catch (error) {
    return { success: false, status: "signed-out", error: formatErrorMessage(error) };
  }
}

/**
 * Ends the administrator session.
 */
export async function logoutAdminAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await createServerSupabaseClient();
    await client.auth.signOut();
    return { success: true };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Refreshes the active administrator session.
 */
export async function refreshAdminSessionAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await createServerSupabaseClient();
    const { error } = await client.auth.refreshSession();
    if (error) throw error;
    return { success: true };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Loads featured stories for the administrator panel.
 */
export async function getAdminStoriesAction(): Promise<{
  success: boolean;
  stories?: AdminStory[];
  error?: string;
  isSetupError?: boolean;
}> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") {
      return {
        success: false,
        error: "Administrator access required.",
        isSetupError: authResult.status === "setup-error",
      };
    }

    const { data, error } = await authResult.client
      .from("featured_stories")
      .select("id, title, category, year, sort_order, story_photos(id, image_url, storage_path, sort_order)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "story_photos" });

    if (error) throw error;

    const orderedStories: AdminStory[] = ((data ?? []) as AdminStory[]).map((story) => ({
      ...story,
      story_photos: (story.story_photos ?? []).map((photo) => ({
        ...photo,
        image_url: toProxiedImageUrl(photo.image_url) ?? photo.image_url,
      })),
    }));

    return { success: true, stories: orderedStories };
  } catch (error) {
    const isSetup = isMissingSchemaTable(error);
    return {
      success: false,
      error: formatErrorMessage(error),
      isSetupError: isSetup,
    };
  }
}

/**
 * Loads the current homepage background.
 */
export async function getAdminHeroBackgroundAction(): Promise<{
  success: boolean;
  heroBackground?: AdminHeroBackground;
  error?: string;
  isSetupError?: boolean;
}> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") {
      return {
        success: false,
        error: "Administrator access required.",
        isSetupError: authResult.status === "setup-error",
      };
    }

    const { data, error } = await authResult.client
      .from("site_settings")
      .select("value, storage_path")
      .eq("key", "hero_background")
      .maybeSingle();

    if (error) throw error;

    const heroBackground: AdminHeroBackground = data
      ? {
          value: toProxiedImageUrl(data.value) ?? data.value,
          storage_path: data.storage_path,
        }
      : null;

    return { success: true, heroBackground };
  } catch (error) {
    const isSetup = isMissingSchemaTable(error);
    return {
      success: false,
      error: formatErrorMessage(error),
      isSetupError: isSetup,
    };
  }
}

/**
 * Loads the current featured stories year label (e.g. 2025 — 2026).
 */
export async function getAdminPortfolioYearsAction(): Promise<{
  success: boolean;
  years?: string;
  error?: string;
  isSetupError?: boolean;
}> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") {
      return {
        success: false,
        error: "Administrator access required.",
        isSetupError: authResult.status === "setup-error",
      };
    }

    const { data, error } = await authResult.client
      .from("site_settings")
      .select("value")
      .eq("key", "portfolio_years")
      .maybeSingle();

    if (error) throw error;

    return { success: true, years: data?.value || "2025 — 2026" };
  } catch (error) {
    const isSetup = isMissingSchemaTable(error);
    return {
      success: false,
      error: formatErrorMessage(error),
      isSetupError: isSetup,
    };
  }
}

/**
 * Saves the featured stories year label (e.g. 2025 — 2026).
 */
export async function saveAdminPortfolioYearsAction(
  years: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") {
      throw new Error("Administrator access required.");
    }

    const trimmed = years.trim();
    if (!trimmed) {
      throw new Error("Portfolio year label cannot be empty.");
    }

    const adminClient = createAdminSupabaseClient();
    const { error } = await adminClient.from("site_settings").upsert({
      key: "portfolio_years",
      value: trimmed,
    });

    if (error) throw error;

    revalidatePath("/");
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Loads Telegram packages for the administrator panel.
 */
export async function getAdminTelegramPackagesAction(): Promise<{
  success: boolean;
  packages?: TelegramPackage[];
  error?: string;
  isSetupError?: boolean;
}> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") {
      return {
        success: false,
        error: "Administrator access required.",
        isSetupError: authResult.status === "setup-error",
      };
    }

    const { data, error } = await authResult.client
      .from("telegram_packages")
      .select("id, title, price, details, sort_order")
      .order("sort_order")
      .order("created_at");

    if (error) throw error;

    return { success: true, packages: (data ?? []) as TelegramPackage[] };
  } catch (error) {
    const isSetup = isMissingSchemaTable(error);
    return {
      success: false,
      error: formatErrorMessage(error),
      isSetupError: isSetup,
    };
  }
}

/**
 * Creates a new featured story.
 */
export async function createStoryAction(input: {
  title: string;
  category: string;
  year: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") throw new Error("Administrator access required.");

    const title = input.title.trim();
    const category = input.category.trim();
    const year = input.year.trim();

    if (!title || !category || !year) {
      throw new Error("Title, category, and year are required.");
    }

    const { data: countData } = await authResult.client
      .from("featured_stories")
      .select("id", { count: "exact", head: true });

    const sortOrder = (countData?.length ?? 0) + 1;

    const { error } = await authResult.client.from("featured_stories").insert({
      title,
      category,
      year,
      sort_order: sortOrder,
    });

    if (error) throw error;

    revalidatePath("/");
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Updates a featured story's metadata.
 */
export async function saveStoryAction(
  storyId: string,
  input: { title: string; category: string; year: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") throw new Error("Administrator access required.");

    const title = input.title.trim();
    const category = input.category.trim();
    const year = input.year.trim();

    if (!title || !category || !year) {
      throw new Error("Title, category, and year are required.");
    }

    const { error } = await authResult.client
      .from("featured_stories")
      .update({ title, category, year })
      .eq("id", storyId);

    if (error) throw error;

    revalidatePath("/");
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Deletes a featured story and removes any stored photos.
 */
export async function deleteStoryAction(storyId: string): Promise<{
  success: boolean;
  error?: string;
  warning?: string;
}> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") throw new Error("Administrator access required.");

    // Fetch story photos before deletion to retrieve storage paths
    const { data: photos } = await authResult.client
      .from("story_photos")
      .select("storage_path")
      .eq("story_id", storyId);

    const storagePaths = (photos ?? [])
      .map((p) => p.storage_path)
      .filter((p): p is string => Boolean(p));

    const { data, error: deleteError } = await authResult.client
      .from("featured_stories")
      .delete()
      .eq("id", storyId)
      .select("id")
      .maybeSingle();

    if (deleteError) throw deleteError;
    if (!data) throw new Error("The collection was not found or could not be deleted.");

    let warning: string | undefined;
    if (storagePaths.length > 0) {
      const adminClient = createAdminSupabaseClient();
      const { error: storageError } = await adminClient.storage
        .from("portfolio-photos")
        .remove(storagePaths);

      if (storageError) {
        warning = `Collection deleted, but some stored photo files could not be cleaned up: ${storageError.message}`;
      }
    }

    revalidatePath("/");
    revalidatePath("/admin");
    return { success: true, warning };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Removes a photo from a story and its storage file.
 */
export async function removePhotoAction(
  photoId: string,
  storagePath?: string | null,
): Promise<{ success: boolean; error?: string; warning?: string }> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") throw new Error("Administrator access required.");

    const { error: deleteError } = await authResult.client
      .from("story_photos")
      .delete()
      .eq("id", photoId);

    if (deleteError) throw deleteError;

    let warning: string | undefined;
    if (storagePath) {
      const adminClient = createAdminSupabaseClient();
      const { error: storageError } = await adminClient.storage
        .from("portfolio-photos")
        .remove([storagePath]);

      if (storageError) {
        warning = `Photo removed from story, but stored file could not be deleted: ${storageError.message}`;
      }
    }

    revalidatePath("/");
    revalidatePath("/admin");
    return { success: true, warning };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Sets a specific photo as the cover photo for a story (reordering it to sort_order = 1).
 */
export async function setStoryCoverPhotoAction(
  storyId: string,
  photoId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") throw new Error("Administrator access required.");

    const adminClient = createAdminSupabaseClient();

    const { data: photos, error: fetchError } = await adminClient
      .from("story_photos")
      .select("id, sort_order")
      .eq("story_id", storyId)
      .order("sort_order");

    if (fetchError) throw fetchError;
    if (!photos || photos.length === 0) throw new Error("No photos found in this collection.");

    const target = photos.find((p) => p.id === photoId);
    if (!target) throw new Error("Selected photo not found in this collection.");

    // Put target photo first, keep others in their existing order
    const reordered = [target, ...photos.filter((p) => p.id !== photoId)];

    for (let i = 0; i < reordered.length; i++) {
      const p = reordered[i];
      const newOrder = i + 1;
      if (p.sort_order !== newOrder) {
        const { error: updateError } = await adminClient
          .from("story_photos")
          .update({ sort_order: newOrder })
          .eq("id", p.id);
        if (updateError) throw updateError;
      }
    }

    revalidatePath("/");
    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Creates a Telegram package.
 */
export async function createTelegramPackageAction(input: {
  title: string;
  price: string;
  details: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") throw new Error("Administrator access required.");

    const title = input.title.trim();
    const price = input.price.trim();
    const details = input.details.trim();

    if (!title || !price || !details) {
      throw new Error("Title, price, and details are required.");
    }

    const { data: existingPackages } = await authResult.client
      .from("telegram_packages")
      .select("sort_order");

    const maxSort = Math.max(0, ...(existingPackages ?? []).map((p) => p.sort_order ?? 0));

    const { error } = await authResult.client.from("telegram_packages").insert({
      title,
      price,
      details,
      sort_order: maxSort + 1,
    });

    if (error) throw error;

    revalidatePath("/admin/telegram");
    return { success: true };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Saves updates to a Telegram package.
 */
export async function saveTelegramPackageAction(
  packageId: string,
  input: { title: string; price: string; details: string },
): Promise<{ success: boolean; error?: string }> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") throw new Error("Administrator access required.");

    const title = input.title.trim();
    const price = input.price.trim();
    const details = input.details.trim();

    if (!title || !price || !details) {
      throw new Error("Title, price, and details are required.");
    }

    const { error } = await authResult.client
      .from("telegram_packages")
      .update({ title, price, details })
      .eq("id", packageId);

    if (error) throw error;

    revalidatePath("/admin/telegram");
    return { success: true };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Deletes a Telegram package.
 */
export async function deleteTelegramPackageAction(
  packageId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") throw new Error("Administrator access required.");

    const { error } = await authResult.client
      .from("telegram_packages")
      .delete()
      .eq("id", packageId);

    if (error) throw error;

    revalidatePath("/admin/telegram");
    return { success: true };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

/**
 * Uploads an image (story photo or hero background) server-side to Supabase Storage.
 */
export async function uploadAdminImageAction(
  formData: FormData,
): Promise<{ success: boolean; imageUrl?: string; photoId?: string; error?: string }> {
  try {
    const authResult = await verifyAdminSession();
    if (authResult.status !== "admin") throw new Error("Administrator access required.");

    const purpose = formData.get("purpose");
    const storyId = formData.get("storyId") ? String(formData.get("storyId")) : undefined;
    const file = formData.get("file");
    const setAsCover = formData.get("setAsCover") === "true";
    const replacePhotoId = formData.get("replacePhotoId")
      ? String(formData.get("replacePhotoId"))
      : undefined;

    if (purpose !== "story-photo" && purpose !== "hero-background") {
      throw new Error("Invalid image purpose.");
    }

    if (!(file instanceof File) || file.size === 0) {
      throw new Error("A valid image file is required.");
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new Error("Image must be no larger than 20 MB.");
    }

    let bytes = new Uint8Array(await file.arrayBuffer());
    let contentType: string | null = detectImageMimeType(bytes, file.name || file.type);
    if (!contentType) {
      throw new Error("Unsupported image format. Please upload a valid image file.");
    }

    let extension = getExtensionForMime(contentType, file.name);

    // Backend image processing & compression with sharp:
    // Auto-orient EXIF orientation, preserve 100% original dimensions, and compress to high-fidelity WebP
    if (contentType !== "image/svg+xml" && contentType !== "image/x-icon") {
      try {
        const sharp = (await import("sharp")).default;
        const isGif = contentType === "image/gif";
        const processed = await sharp(bytes, { animated: isGif })
          .rotate()
          .webp({ quality: 90, effort: 4 })
          .toBuffer();

        bytes = new Uint8Array(processed);
        contentType = "image/webp";
        extension = "webp";
      } catch (procErr) {
        console.warn("Sharp compression skipped, keeping original format:", procErr);
      }
    }

    const adminClient = createAdminSupabaseClient();

    if (purpose === "story-photo") {
      if (!storyId) throw new Error("A collection must be specified.");

      const { data: story, error: storyError } = await adminClient
        .from("featured_stories")
        .select("id")
        .eq("id", storyId)
        .maybeSingle();

      if (storyError || !story) throw new Error("Selected collection was not found.");
    }

    const storagePath =
      purpose === "hero-background"
        ? `hero/${crypto.randomUUID()}.${extension}`
        : `${storyId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await adminClient.storage
      .from("portfolio-photos")
      .upload(storagePath, bytes, { contentType, upsert: false });

    if (uploadError) throw new Error(`Unable to store image: ${uploadError.message}`);

    const { data: publicUrlData } = adminClient.storage
      .from("portfolio-photos")
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;
    let insertedPhotoId: string | undefined;

    if (purpose === "story-photo") {
      const { data: lastPhoto } = await adminClient
        .from("story_photos")
        .select("sort_order")
        .eq("story_id", storyId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: insertedPhoto, error: insertError } = await adminClient
        .from("story_photos")
        .insert({
          story_id: storyId,
          image_url: publicUrl,
          storage_path: storagePath,
          sort_order: setAsCover ? 0 : (lastPhoto?.sort_order ?? 0) + 1,
        })
        .select("id")
        .single();

      if (insertError) {
        await adminClient.storage.from("portfolio-photos").remove([storagePath]);
        throw new Error(`Unable to save photo details: ${insertError.message}`);
      }

      insertedPhotoId = insertedPhoto.id;

      // If replacing a previous photo, delete the old photo
      if (replacePhotoId && replacePhotoId !== insertedPhoto.id) {
        const { data: oldPhoto } = await adminClient
          .from("story_photos")
          .select("storage_path")
          .eq("id", replacePhotoId)
          .maybeSingle();

        await adminClient.from("story_photos").delete().eq("id", replacePhotoId);
        if (oldPhoto?.storage_path) {
          await adminClient.storage
            .from("portfolio-photos")
            .remove([oldPhoto.storage_path])
            .catch(() => {});
        }
      }

      // If setAsCover is true, reorder photos so new photo is sort_order = 1
      if (setAsCover) {
        const { data: allPhotos } = await adminClient
          .from("story_photos")
          .select("id, sort_order")
          .eq("story_id", storyId)
          .order("sort_order");

        const photosList = (allPhotos ?? []) as { id: string; sort_order: number }[];
        if (photosList.length > 0) {
          const target = photosList.find((p) => p.id === insertedPhoto.id);
          const others = photosList.filter((p) => p.id !== insertedPhoto.id);
          const reordered = target ? [target, ...others] : photosList;
          for (let i = 0; i < reordered.length; i++) {
            const p = reordered[i];
            const newOrder = i + 1;
            if (p.sort_order !== newOrder) {
              await adminClient
                .from("story_photos")
                .update({ sort_order: newOrder })
                .eq("id", p.id);
            }
          }
        }
      }
    } else {
      const { data: previousSetting } = await adminClient
        .from("site_settings")
        .select("storage_path")
        .eq("key", "hero_background")
        .maybeSingle();

      const { error: settingsError } = await adminClient.from("site_settings").upsert({
        key: "hero_background",
        value: publicUrl,
        storage_path: storagePath,
      });

      if (settingsError) {
        await adminClient.storage.from("portfolio-photos").remove([storagePath]);
        throw new Error(`Unable to save hero background: ${settingsError.message}`);
      }

      if (previousSetting?.storage_path) {
        await adminClient.storage
          .from("portfolio-photos")
          .remove([previousSetting.storage_path])
          .catch(() => {});
      }
    }

    revalidatePath("/");
    revalidatePath("/admin");

    const proxiedUrl = toProxiedImageUrl(publicUrl) ?? publicUrl;
    return { success: true, imageUrl: proxiedUrl, photoId: insertedPhotoId };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}
