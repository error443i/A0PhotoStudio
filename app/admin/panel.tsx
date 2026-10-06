"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { TelegramPackage } from "@/lib/telegram-packages";

type Photo = {
  id: string;
  image_url: string;
  storage_path: string | null;
  sort_order: number;
};

type Story = {
  id: string;
  title: string;
  category: string;
  year: string;
  sort_order: number;
  story_photos: Photo[];
};

type PackageDraft = Pick<TelegramPackage, "title" | "price" | "details">;

type HeroBackground = {
  value: string;
  storage_path: string | null;
} | null;

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  onConfirm: () => void;
};

type PanelState = "checking" | "signed-out" | "not-admin" | "setup-error" | "admin";
type AdminSection = "collections" | "telegram";

const ADMIN_SESSION_DURATION_MS = 10 * 60 * 1000;
const SESSION_WARNING_DURATION_MS = 60 * 1000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingSchemaTable(error: unknown) {
  if (typeof error !== "object" || error === null || !("message" in error)) return false;
  if (typeof error.message !== "string") return false;

  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  return (
    code === "PGRST205" ||
    error.message.includes("schema cache") ||
    error.message.includes("Could not find the table")
  );
}

export default function AdminPanel({ section = "collections" }: { section?: AdminSection }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [panelState, setPanelState] = useState<PanelState>("checking");
  const [stories, setStories] = useState<Story[]>([]);
  const [telegramPackages, setTelegramPackages] = useState<TelegramPackage[]>([]);
  const [heroBackground, setHeroBackground] = useState<HeroBackground>(null);
  const [drafts, setDrafts] = useState<Record<string, Pick<Story, "title" | "category" | "year">>>({});
  const [packageDrafts, setPackageDrafts] = useState<Record<string, PackageDraft>>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newStory, setNewStory] = useState({ title: "", category: "", year: "" });
  const [newPackage, setNewPackage] = useState<PackageDraft>({ title: "", price: "", details: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(60);
  const [sessionActionBusy, setSessionActionBusy] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);

  useEffect(() => {
    if (!confirmation) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirmation(null);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [confirmation]);

  async function loadStories(client: SupabaseClient) {
    const { data, error: queryError } = await client
      .from("featured_stories")
      .select("id, title, category, year, sort_order, story_photos(id, image_url, storage_path, sort_order)")
      .order("sort_order")
      .order("sort_order", { referencedTable: "story_photos" });

    if (queryError) throw queryError;

    const orderedStories = ((data ?? []) as Story[]).map((story) => ({
      ...story,
      story_photos: story.story_photos ?? [],
    }));

    setStories(orderedStories);
    setDrafts(
      Object.fromEntries(
        orderedStories.map(({ id, title, category, year }) => [id, { title, category, year }]),
      ),
    );
  }

  async function loadHeroBackground(client: SupabaseClient) {
    const { data, error: queryError } = await client
      .from("site_settings")
      .select("value, storage_path")
      .eq("key", "hero_background")
      .maybeSingle();

    if (queryError) throw queryError;
    setHeroBackground(data);
  }

  async function loadTelegramPackages(client: SupabaseClient) {
    const { data, error: queryError } = await client
      .from("telegram_packages")
      .select("id, title, price, details, sort_order")
      .order("sort_order")
      .order("created_at");

    if (queryError) throw queryError;

    const orderedPackages = (data ?? []) as TelegramPackage[];
    setTelegramPackages(orderedPackages);
    setPackageDrafts(
      Object.fromEntries(
        orderedPackages.map(({ id, title, price, details }) => [id, { title, price, details }]),
      ),
    );
  }

  useEffect(() => {
    let mounted = true;
    let client: SupabaseClient;

    try {
      client = createBrowserSupabaseClient();
      setSupabase(client);
    } catch (clientError) {
      setError(`Unable to initialize Supabase: ${errorMessage(clientError)}`);
      setPanelState("signed-out");
      return () => {
        mounted = false;
      };
    }

    async function verifyAccess(supabaseClient: SupabaseClient) {
      setPanelState("checking");
      const { data, error: authError } = await supabaseClient.auth.getUser();
      if (!mounted) return;

      if (authError && authError.name !== "AuthSessionMissingError" && authError.status !== 401) {
        setError(`Unable to verify your session: ${authError.message}`);
        setPanelState("signed-out");
        return;
      }

      if (!data.user) {
        setPanelState("signed-out");
        return;
      }

      const { data: adminRecord, error: adminError } = await supabaseClient
        .from("admin_users")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!mounted) return;
      if (adminError) {
        if (isMissingSchemaTable(adminError)) {
          setError(
            "The admin tables are missing from Supabase. Run supabase/migrations/20261005000000_portfolio_admin.sql, supabase/migrations/20261006000000_hero_background.sql, and supabase/migrations/20261007000000_telegram_packages.sql in the Supabase SQL Editor, then refresh this page.",
          );
          setPanelState("setup-error");
        } else {
          setError(`Unable to verify admin access: ${adminError.message}`);
          setPanelState("not-admin");
        }
        return;
      }
      if (!adminRecord) {
        setPanelState("not-admin");
        return;
      }

      try {
        if (section === "telegram") {
          await loadTelegramPackages(supabaseClient);
        } else {
          await loadStories(supabaseClient);
          await loadHeroBackground(supabaseClient);
        }
        if (mounted) setPanelState("admin");
      } catch (loadError) {
        if (mounted) {
          if (isMissingSchemaTable(loadError)) {
            setError(
              "Required admin tables are missing from Supabase. Run supabase/migrations/20261005000000_portfolio_admin.sql, supabase/migrations/20261006000000_hero_background.sql, and supabase/migrations/20261007000000_telegram_packages.sql in the Supabase SQL Editor, then refresh this page.",
            );
            setPanelState("setup-error");
          } else {
            setError(`Unable to load admin content: ${errorMessage(loadError)}`);
            setPanelState("admin");
          }
        }
      }
    }

    void verifyAccess(client);
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        setSessionExpiresAt(session ? Date.now() + ADMIN_SESSION_DURATION_MS : null);
      } else if (event === "SIGNED_OUT") {
        setSessionExpiresAt(null);
        setSessionWarning(false);
      }
      queueMicrotask(() => void verifyAccess(client));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [section]);

  useEffect(() => {
    if (!supabase || !sessionExpiresAt) return;

    const client = supabase;
    const expiresAt = sessionExpiresAt;
    let countdownTimer: ReturnType<typeof setInterval> | undefined;
    let expired = false;
    const warningDelay = Math.max(0, expiresAt - Date.now() - SESSION_WARNING_DURATION_MS);
    const expiryDelay = Math.max(0, expiresAt - Date.now());

    function updateWarningCountdown() {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        void expireSession();
        return;
      }
      setSessionWarning(true);
      setSessionSecondsLeft(Math.ceil(remainingMs / 1000));
    }

    function startWarningCountdown() {
      updateWarningCountdown();
      if (!countdownTimer) {
        countdownTimer = setInterval(updateWarningCountdown, 1000);
      }
    }

    async function expireSession() {
      if (expired) return;
      expired = true;
      setSessionWarning(false);
      try {
        const { error: logoutError } = await client.auth.signOut();
        if (logoutError) {
          setError(`Unable to sign out after session timeout: ${logoutError.message}`);
        }
      } catch (logoutError) {
        setError(`Unable to sign out after session timeout: ${errorMessage(logoutError)}`);
      }
    }

    const warningTimer = warningDelay === 0
      ? undefined
      : setTimeout(startWarningCountdown, warningDelay);
    const expiryTimer = setTimeout(() => void expireSession(), expiryDelay);
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || expired) return;
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        void expireSession();
      } else if (remainingMs <= SESSION_WARNING_DURATION_MS) {
        startWarningCountdown();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (expiresAt - Date.now() <= SESSION_WARNING_DURATION_MS) {
      startWarningCountdown();
    }

    return () => {
      if (warningTimer) clearTimeout(warningTimer);
      clearTimeout(expiryTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sessionExpiresAt, supabase]);

  async function handleContinueSession() {
    if (!supabase || sessionActionBusy) return;
    setSessionActionBusy(true);
    setError("");

    try {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        setError(`Unable to continue your session: ${refreshError.message}`);
        return;
      }
      if (!data.session) {
        setError("Unable to continue your session. Please sign in again.");
        return;
      }
      setSessionExpiresAt(Date.now() + ADMIN_SESSION_DURATION_MS);
      setSessionWarning(false);
    } catch (refreshError) {
      setError(`Unable to continue your session: ${errorMessage(refreshError)}`);
    } finally {
      setSessionActionBusy(false);
    }
  }

  async function handleSessionLogout() {
    if (!supabase || sessionActionBusy) return;
    setSessionActionBusy(true);
    setError("");

    try {
      const { error: logoutError } = await supabase.auth.signOut();
      if (logoutError) {
        setError(`Unable to sign out: ${logoutError.message}`);
        return;
      }
      setSessionWarning(false);
    } catch (logoutError) {
      setError(`Unable to sign out: ${errorMessage(logoutError)}`);
    } finally {
      setSessionActionBusy(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy("login");

    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      setBusy("");
      return;
    }
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) setError(`Unable to sign in: ${loginError.message}`);
      else setPassword("");
    } catch (loginError) {
      setError(`Unable to sign in: ${errorMessage(loginError)}`);
    } finally {
      setBusy("");
    }
  }

  function handleLogout() {
    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      return;
    }

    setConfirmation({
      title: "Sign out?",
      description: "Are you sure you want to end your admin session?",
      confirmLabel: "Sign out",
      destructive: true,
      onConfirm: () => void performLogout(supabase),
    });
  }

  async function performLogout(client: SupabaseClient) {
    setError("");
    try {
      const { error: logoutError } = await client.auth.signOut();
      if (logoutError) setError(`Unable to sign out: ${logoutError.message}`);
    } catch (logoutError) {
      setError(`Unable to sign out: ${errorMessage(logoutError)}`);
    }
  }

  async function handleCreateStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy("create-story");
    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      setBusy("");
      return;
    }

    const story = {
      title: newStory.title.trim(),
      category: newStory.category.trim(),
      year: newStory.year.trim(),
      sort_order: stories.length + 1,
    };
    try {
      const { error: insertError } = await supabase.from("featured_stories").insert(story);
      if (insertError) {
        setError(`Unable to add featured story: ${insertError.message}`);
        setBusy("");
        return;
      }
      setNewStory({ title: "", category: "", year: "" });
      setMessage("Featured story added.");
    } catch (createError) {
      setError(`Unable to add featured story: ${errorMessage(createError)}`);
      setBusy("");
      return;
    }

    try {
      await loadStories(supabase);
    } catch (loadError) {
      setError(`Story was added, but the list could not refresh: ${errorMessage(loadError)}`);
    }
    setBusy("");
  }

  async function handleSaveStory(storyId: string) {
    const draft = drafts[storyId];
    if (!draft) return;
    setError("");
    setMessage("");
    setBusy(`save:${storyId}`);
    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      setBusy("");
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from("featured_stories")
        .update({
          title: draft.title.trim(),
          category: draft.category.trim(),
          year: draft.year.trim(),
        })
        .eq("id", storyId);
      if (updateError) {
        setError(`Unable to save story: ${updateError.message}`);
        setBusy("");
        return;
      }
      setMessage("Story details saved.");
    } catch (saveError) {
      setError(`Unable to save story: ${errorMessage(saveError)}`);
      setBusy("");
      return;
    }

    try {
      await loadStories(supabase);
    } catch (loadError) {
      setError(`Story was saved, but the list could not refresh: ${errorMessage(loadError)}`);
    }
    setBusy("");
  }

  async function handleCreatePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      return;
    }

    setBusy("create-package");
    try {
      const { error: insertError } = await supabase.from("telegram_packages").insert({
        title: newPackage.title.trim(),
        price: newPackage.price.trim(),
        details: newPackage.details.trim(),
        sort_order: Math.max(0, ...telegramPackages.map((item) => item.sort_order)) + 1,
      });
      if (insertError) throw insertError;

      setNewPackage({ title: "", price: "", details: "" });
      await loadTelegramPackages(supabase);
      setMessage("Telegram package added.");
    } catch (createError) {
      setError(`Unable to add Telegram package: ${errorMessage(createError)}`);
    } finally {
      setBusy("");
    }
  }

  async function handleSavePackage(packageId: string) {
    const draft = packageDrafts[packageId];
    if (!draft) return;
    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      return;
    }

    setConfirmation({
      title: "Save package changes?",
      description: `Save the updated details for “${draft.title.trim()}” and apply them to the Telegram bot?`,
      confirmLabel: "Save changes",
      destructive: false,
      onConfirm: () => void savePackage(supabase, packageId, draft),
    });
  }

  async function savePackage(
    client: SupabaseClient,
    packageId: string,
    draft: PackageDraft,
  ) {
    setError("");
    setMessage("");
    setBusy(`save-package:${packageId}`);
    try {
      const { error: updateError } = await client
        .from("telegram_packages")
        .update({
          title: draft.title.trim(),
          price: draft.price.trim(),
          details: draft.details.trim(),
        })
        .eq("id", packageId);
      if (updateError) throw updateError;

      await loadTelegramPackages(client);
      setMessage("Telegram package saved.");
    } catch (saveError) {
      setError(`Unable to save Telegram package: ${errorMessage(saveError)}`);
    } finally {
      setBusy("");
    }
  }

  function handleDeletePackage(photoPackage: TelegramPackage) {
    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      return;
    }

    setConfirmation({
      title: "Delete this Telegram package?",
      description: `“${photoPackage.title}” will be removed from the bot. This cannot be undone.`,
      confirmLabel: "Delete package",
      destructive: true,
      onConfirm: () => void deletePackage(supabase, photoPackage),
    });
  }

  async function deletePackage(client: SupabaseClient, photoPackage: TelegramPackage) {
    setError("");
    setMessage("");
    setBusy(`delete-package:${photoPackage.id}`);
    try {
      const { error: deleteError } = await client
        .from("telegram_packages")
        .delete()
        .eq("id", photoPackage.id);
      if (deleteError) throw deleteError;

      await loadTelegramPackages(client);
      setMessage(`Telegram package “${photoPackage.title}” deleted.`);
    } catch (deleteError) {
      setError(`Unable to delete Telegram package: ${errorMessage(deleteError)}`);
    } finally {
      setBusy("");
    }
  }

  async function handleUpload(story: Story, event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      return;
    }

    const invalidFile = files.find(
      (file) =>
        !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) ||
        file.size > 12 * 1024 * 1024,
    );
    if (invalidFile) {
      setError(`${invalidFile.name} must be a JPEG, PNG, WebP, or AVIF image no larger than 12 MB.`);
      return;
    }

    const photoLabel = files.length === 1 ? "photo" : `${files.length} photos`;
    setConfirmation({
      title: files.length === 1 ? "Add this file?" : "Add these files?",
      description: `Add ${photoLabel} to “${story.title}”?`,
      confirmLabel: "Add",
      destructive: false,
      onConfirm: () => void uploadPhotos(supabase, story, files),
    });
  }

  async function uploadPhotos(client: SupabaseClient, story: Story, files: File[]) {
    setError("");
    setMessage("");
    setBusy(`upload:${story.id}`);
    const uploaded: { path: string; imageUrl: string; sortOrder: number }[] = [];

    try {
      for (const [index, file] of files.entries()) {
        const safeName = file.name.replace(/[^\w.-]/g, "-");
        const path = `${story.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await client.storage
          .from("portfolio-photos")
          .upload(path, file, { contentType: file.type, upsert: false });

        if (uploadError) throw uploadError;
        const { data } = client.storage.from("portfolio-photos").getPublicUrl(path);
        uploaded.push({
          path,
          imageUrl: data.publicUrl,
          sortOrder:
            Math.max(0, ...story.story_photos.map((photo) => photo.sort_order)) + index + 1,
        });
      }
    } catch (uploadError) {
      let detail = errorMessage(uploadError);
      if (uploaded.length > 0) {
        const { error: cleanupError } = await client.storage
          .from("portfolio-photos")
          .remove(uploaded.map((photo) => photo.path));
        if (cleanupError) {
          detail += ` Uploaded-file cleanup also failed: ${cleanupError.message}`;
        }
      }
      setError(`Unable to add photos: ${detail}`);
      setBusy("");
      return;
    }

    const { error: insertError } = await client.from("story_photos").insert(
      uploaded.map((photo) => ({
        story_id: story.id,
        image_url: photo.imageUrl,
        storage_path: photo.path,
        sort_order: photo.sortOrder,
      })),
    );
    if (insertError) {
      const { error: cleanupError } = await client.storage
        .from("portfolio-photos")
        .remove(uploaded.map((photo) => photo.path));
      const detail = cleanupError
        ? `${insertError.message} Uploaded-file cleanup also failed: ${cleanupError.message}`
        : insertError.message;
      setError(`Unable to save uploaded photos: ${detail}`);
      setBusy("");
      return;
    }

    setMessage(`${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} added.`);
    try {
      await loadStories(client);
    } catch (loadError) {
      setError(`Photos were uploaded, but the list could not refresh: ${errorMessage(loadError)}`);
    }
    setBusy("");
  }

  async function handleHeroBackgroundUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) ||
      file.size > 12 * 1024 * 1024
    ) {
      setError(`${file.name} must be a JPEG, PNG, WebP, or AVIF image no larger than 12 MB.`);
      return;
    }

    setConfirmation({
      title: "Change this background photo?",
      description: "This photo will replace the current homepage background.",
      confirmLabel: "Change photo",
      destructive: false,
      onConfirm: () => void saveHeroBackground(supabase, file),
    });
  }

  async function saveHeroBackground(client: SupabaseClient, file: File) {
    setError("");
    setMessage("");
    setBusy("hero-background");
    const path = `hero/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "-")}`;
    let uploaded = false;

    try {
      const { error: uploadError } = await client.storage
        .from("portfolio-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploaded = true;

      const { data } = client.storage.from("portfolio-photos").getPublicUrl(path);
      const { error: saveError } = await client.from("site_settings").upsert({
        key: "hero_background",
        value: data.publicUrl,
        storage_path: path,
      });

      if (saveError) {
        const { error: cleanupError } = await client.storage.from("portfolio-photos").remove([path]);
        uploaded = false;
        const detail = cleanupError
          ? `${saveError.message} Uploaded-file cleanup also failed: ${cleanupError.message}`
          : saveError.message;
        setError(`Unable to save the hero background: ${detail}`);
        setBusy("");
        return;
      }

      uploaded = false;
      const previousPath = heroBackground?.storage_path;
      setHeroBackground({ value: data.publicUrl, storage_path: path });
      setMessage("Homepage background photo updated.");

      if (previousPath && previousPath !== path) {
        try {
          const { error: cleanupError } = await client.storage
            .from("portfolio-photos")
            .remove([previousPath]);
          if (cleanupError) {
            setError(`Background photo updated, but the previous file could not be deleted: ${cleanupError.message}`);
          }
        } catch (cleanupError) {
          setError(`Background photo updated, but the previous file could not be deleted: ${errorMessage(cleanupError)}`);
        }
      }
    } catch (uploadError) {
      let detail = errorMessage(uploadError);
      if (uploaded) {
        const { error: cleanupError } = await client.storage.from("portfolio-photos").remove([path]);
        if (cleanupError) {
          detail += ` Uploaded-file cleanup also failed: ${cleanupError.message}`;
        }
      }
      setError(`Unable to upload the hero background: ${detail}`);
    } finally {
      setBusy("");
    }
  }

  async function handleRemovePhoto(story: Story, photo: Photo) {
    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      return;
    }

    setConfirmation({
      title: "Remove this file?",
      description: `This photo will be removed from “${story.title}”.`,
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: () => void removePhoto(supabase, story, photo),
    });
  }

  async function removePhoto(client: SupabaseClient, story: Story, photo: Photo) {
    setError("");
    setMessage("");
    setBusy(`remove:${photo.id}`);
    let operationError = "";
    let recordDeleted = false;

    try {
      const { error: deleteError } = await client
        .from("story_photos")
        .delete()
        .eq("id", photo.id);
      if (deleteError) {
        setError(`Unable to remove photo: ${deleteError.message}`);
        setBusy("");
        return;
      }
      recordDeleted = true;

      if (photo.storage_path) {
        const { error: storageError } = await client.storage
          .from("portfolio-photos")
          .remove([photo.storage_path]);
        if (storageError) {
          operationError = `Photo was removed from the gallery, but its stored file could not be deleted: ${storageError.message}`;
        }
      }
    } catch (removeError) {
      const detail = errorMessage(removeError);
      setError(
        recordDeleted
          ? `Photo was removed from the gallery, but its stored file could not be deleted: ${detail}`
          : `Unable to remove photo: ${detail}`,
      );
      setBusy("");
      return;
    }

    try {
      await loadStories(client);
    } catch (loadError) {
      operationError = `Photo was removed, but the gallery could not refresh: ${errorMessage(loadError)}`;
    }
    if (operationError) setError(operationError);
    else setMessage(`Photo removed from “${story.title}”.`);
    setBusy("");
  }

  function handleDeleteStory(story: Story) {
    if (!supabase) {
      setError("Supabase is not initialized. Refresh the page and try again.");
      return;
    }

    setConfirmation({
      title: "Delete this featured story?",
      description: `“${story.title}” and its ${story.story_photos.length} photo${story.story_photos.length === 1 ? "" : "s"} will be removed from the portfolio. This cannot be undone.`,
      confirmLabel: "Delete story",
      destructive: true,
      onConfirm: () => void deleteStory(supabase, story),
    });
  }

  async function deleteStory(client: SupabaseClient, story: Story) {
    setError("");
    setMessage("");
    setBusy(`delete-story:${story.id}`);

    try {
      const { data, error: deleteError } = await client
        .from("featured_stories")
        .delete()
        .eq("id", story.id)
        .select("id")
        .maybeSingle();

      if (deleteError) {
        setError(`Unable to delete featured story: ${deleteError.message}`);
        setBusy("");
        return;
      }
      if (!data) {
        setError("Unable to delete featured story: it was not found or you do not have permission.");
        setBusy("");
        return;
      }
    } catch (deleteError) {
      setError(`Unable to delete featured story: ${errorMessage(deleteError)}`);
      setBusy("");
      return;
    }

    const storagePaths = story.story_photos
      .map((photo) => photo.storage_path)
      .filter((path): path is string => Boolean(path));
    let operationError = "";

    if (storagePaths.length > 0) {
      try {
        const { error: storageError } = await client.storage
          .from("portfolio-photos")
          .remove(storagePaths);
        if (storageError) {
          operationError = `Story was deleted, but its uploaded photos could not all be removed from storage: ${storageError.message}`;
        }
      } catch (storageError) {
        operationError = `Story was deleted, but its uploaded photos could not all be removed from storage: ${errorMessage(storageError)}`;
      }
    }

    try {
      await loadStories(client);
    } catch (loadError) {
      operationError = operationError
        ? `${operationError} The story list also could not refresh: ${errorMessage(loadError)}`
        : `Story was deleted, but the list could not refresh: ${errorMessage(loadError)}`;
    }

    if (operationError) setError(operationError);
    else setMessage(`Featured story “${story.title}” deleted.`);
    setBusy("");
  }

  if (panelState === "checking") {
    return <main className="admin-page"><p className="admin-status">Checking admin access…</p></main>;
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <Link className="admin-brand" href="/">AO PHOTOGRAPHY</Link>
        <Link className="admin-back-link" href="/">VIEW WEBSITE <span aria-hidden="true">↗</span></Link>
      </header>

      {panelState === "signed-out" ? (
        <section className="admin-auth">
          <p className="section-index">AO PHOTOGRAPHY · ADMIN</p>
          <h1>Welcome <em>back.</em></h1>
          <p className="admin-intro">Sign in with your authorized administrator account to manage Telegram packages, featured stories, and photographs.</p>
          {error && <p className="admin-alert" role="alert">{error}</p>}
          <form className="admin-form" onSubmit={handleLogin}>
            <label>
              Email address
              <input
                autoComplete="username"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button className="admin-primary-button" type="submit" disabled={busy === "login"}>
              {busy === "login" ? "SIGNING IN…" : "SIGN IN"}
            </button>
          </form>
        </section>
      ) : panelState === "not-admin" ? (
        <section className="admin-auth">
          <p className="section-index">AO PHOTOGRAPHY · ADMIN</p>
          <h1>Access <em>restricted.</em></h1>
          <p className="admin-intro">
            This account is signed in but is not on the authorized admin list. In Supabase SQL Editor,
            add the account you intend to use as the site administrator:
          </p>
          <pre className="admin-sql"><code>{`insert into public.admin_users (user_id)
select id from auth.users where email = 'YOUR_LOGIN_EMAIL'
on conflict (user_id) do nothing;`}</code></pre>
          <p className="admin-intro">Replace <code>YOUR_LOGIN_EMAIL</code> with your Supabase Auth email, run the query, then refresh this page.</p>
          {error && <p className="admin-alert" role="alert">{error}</p>}
          <button className="admin-secondary-button" type="button" onClick={handleLogout}>SIGN OUT</button>
        </section>
      ) : panelState === "setup-error" ? (
        <section className="admin-auth">
          <p className="section-index">AO PHOTOGRAPHY · SETUP REQUIRED</p>
          <h1>One last <em>step.</em></h1>
          <p className="admin-intro">The database tables required by the admin panel are not available yet. In your Supabase project, open SQL Editor and run <code>supabase/migrations/20261005000000_portfolio_admin.sql</code>, <code>supabase/migrations/20261006000000_hero_background.sql</code>, and <code>supabase/migrations/20261007000000_telegram_packages.sql</code>. Then refresh this page.</p>
          {error && <p className="admin-alert" role="alert">{error}</p>}
          <button className="admin-secondary-button" type="button" onClick={() => window.location.reload()}>REFRESH PAGE</button>
        </section>
      ) : (
        <section className="admin-content">
          <div className="admin-heading">
            <div>
              <p className="section-index">AO PHOTOGRAPHY · ADMIN</p>
              <h1>{section === "telegram" ? <>Telegram <em>bot.</em></> : <>Featured <em>collections.</em></>}</h1>
              <p className="admin-intro">
                {section === "telegram"
                  ? "Manage the photo packages and details shown to clients in Telegram."
                  : "Manage featured collections, photographs, and the homepage background."}
              </p>
            </div>
            <button className="admin-secondary-button" type="button" onClick={handleLogout}>SIGN OUT</button>
          </div>

          <nav className="admin-section-nav" aria-label="Admin sections">
            <Link
              className={`admin-section-link${section === "telegram" ? " is-active" : ""}`}
              href="/admin/telegram"
              aria-current={section === "telegram" ? "page" : undefined}
            >
              TELEGRAM BOT
              <span>Manage packages and prices</span>
            </Link>
            <Link
              className={`admin-section-link${section === "collections" ? " is-active" : ""}`}
              href="/admin"
              aria-current={section === "collections" ? "page" : undefined}
            >
              FEATURED COLLECTIONS
              <span>Manage stories, photos, and homepage</span>
            </Link>
          </nav>

          {error && <p className="admin-alert" role="alert">{error}</p>}
          {message && <p className="admin-success" role="status">{message}</p>}

          {section === "collections" && <section className="admin-background-form" aria-labelledby="background-heading">
            <div>
              <p className="section-index">HOMEPAGE · HERO</p>
              <h2 id="background-heading">Background photo</h2>
              <p className="admin-intro">Choose the image shown behind the homepage introduction.</p>
            </div>
            <div className="admin-background-preview">
              {heroBackground?.value ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroBackground.value} alt="Current homepage background" />
              ) : (
                <div className="admin-background-placeholder">DEFAULT PHOTO</div>
              )}
              <label className="admin-upload-button">
                <span>{busy === "hero-background" ? "UPLOADING PHOTO…" : "＋ CHANGE BACKGROUND PHOTO"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={busy === "hero-background"}
                  onChange={(event) => void handleHeroBackgroundUpload(event)}
                />
              </label>
            </div>
          </section>}

          {section === "telegram" && <section className="admin-package-section" aria-labelledby="telegram-packages-heading">
            <div className="admin-package-intro">
              <p className="section-index">TELEGRAM BOT · PACKAGES</p>
              <h2 id="telegram-packages-heading">Photo shoot packages</h2>
              <p className="admin-intro">
                Add or edit the package names, prices, and details shown in the Telegram bot.
                Changes are available to the bot immediately after saving.
              </p>
            </div>

            <form className="admin-package-create" onSubmit={handleCreatePackage}>
              <h3>Add a package</h3>
              <div className="admin-package-fields">
                <label>
                  Package name
                  <input
                    value={newPackage.title}
                    maxLength={40}
                    onChange={(event) => setNewPackage({ ...newPackage, title: event.target.value })}
                    required
                  />
                </label>
                <label>
                  Price
                  <input
                    value={newPackage.price}
                    maxLength={20}
                    onChange={(event) => setNewPackage({ ...newPackage, price: event.target.value })}
                    required
                  />
                </label>
                <label className="admin-package-details">
                  Package details
                  <textarea
                    value={newPackage.details}
                    maxLength={3500}
                    onChange={(event) => setNewPackage({ ...newPackage, details: event.target.value })}
                    required
                  />
                </label>
                <button className="admin-primary-button" type="submit" disabled={busy === "create-package"}>
                  {busy === "create-package" ? "ADDING…" : "ADD PACKAGE"}
                </button>
              </div>
            </form>

            <div className="admin-package-list">
              {telegramPackages.map((photoPackage, index) => {
                const draft = packageDrafts[photoPackage.id] ?? photoPackage;
                return (
                  <article className="admin-package-card" key={photoPackage.id}>
                    <div className="admin-story-heading">
                      <span className="section-index">PACKAGE {String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <div className="admin-package-fields">
                      <label>
                        Package name
                        <input
                          value={draft.title}
                          maxLength={40}
                          onChange={(event) =>
                            setPackageDrafts({
                              ...packageDrafts,
                              [photoPackage.id]: { ...draft, title: event.target.value },
                            })
                          }
                          required
                        />
                      </label>
                      <label>
                        Price
                        <input
                          value={draft.price}
                          maxLength={20}
                          onChange={(event) =>
                            setPackageDrafts({
                              ...packageDrafts,
                              [photoPackage.id]: { ...draft, price: event.target.value },
                            })
                          }
                          required
                        />
                      </label>
                      <label className="admin-package-details">
                        Package details
                        <textarea
                          value={draft.details}
                          maxLength={3500}
                          onChange={(event) =>
                            setPackageDrafts({
                              ...packageDrafts,
                              [photoPackage.id]: { ...draft, details: event.target.value },
                            })
                          }
                          required
                        />
                      </label>
                      <div className="admin-package-actions">
                        <button
                          className="admin-secondary-button"
                          type="button"
                          disabled={busy === `save-package:${photoPackage.id}`}
                          onClick={() => void handleSavePackage(photoPackage.id)}
                        >
                          {busy === `save-package:${photoPackage.id}` ? "SAVING…" : "SAVE PACKAGE"}
                        </button>
                        <button
                          className="admin-story-delete-button"
                          type="button"
                          disabled={busy === `delete-package:${photoPackage.id}`}
                          onClick={() => handleDeletePackage(photoPackage)}
                        >
                          {busy === `delete-package:${photoPackage.id}` ? "DELETING…" : "DELETE"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {telegramPackages.length === 0 && (
                <p className="admin-empty-photos">There are no Telegram packages yet. Add one above.</p>
              )}
            </div>
          </section>}

          {section === "collections" && <><form className="admin-create-form" onSubmit={handleCreateStory}>
            <h2>Add a featured story</h2>
            <div className="admin-create-fields">
              <label>Story title<input value={newStory.title} onChange={(event) => setNewStory({ ...newStory, title: event.target.value })} required /></label>
              <label>Category<input value={newStory.category} onChange={(event) => setNewStory({ ...newStory, category: event.target.value })} required /></label>
              <label>Year<input value={newStory.year} onChange={(event) => setNewStory({ ...newStory, year: event.target.value })} required /></label>
              <button className="admin-primary-button" type="submit" disabled={busy === "create-story"}>
                {busy === "create-story" ? "ADDING…" : "ADD STORY"}
              </button>
            </div>
          </form>

          <div className="admin-story-list">
            {stories.map((story, index) => {
              const draft = drafts[story.id] ?? story;
              return (
                <article className="admin-story" key={story.id}>
                  <div className="admin-story-heading">
                    <span className="section-index">STORY {String(index + 1).padStart(2, "0")}</span>
                    <span>{story.story_photos.length} PHOTOS</span>
                  </div>
                  <div className="admin-story-fields">
                    <label>Title<input value={draft.title} onChange={(event) => setDrafts({ ...drafts, [story.id]: { ...draft, title: event.target.value } })} required /></label>
                    <label>Category<input value={draft.category} onChange={(event) => setDrafts({ ...drafts, [story.id]: { ...draft, category: event.target.value } })} required /></label>
                    <label>Year<input value={draft.year} onChange={(event) => setDrafts({ ...drafts, [story.id]: { ...draft, year: event.target.value } })} required /></label>
                    <button
                      className="admin-secondary-button"
                      type="button"
                      disabled={busy === `save:${story.id}`}
                      onClick={() => void handleSaveStory(story.id)}
                    >
                      {busy === `save:${story.id}` ? "SAVING…" : "SAVE DETAILS"}
                    </button>
                    <button
                      className="admin-story-delete-button"
                      type="button"
                      disabled={busy === `delete-story:${story.id}`}
                      onClick={() => handleDeleteStory(story)}
                    >
                      {busy === `delete-story:${story.id}` ? "DELETING…" : "DELETE STORY"}
                    </button>
                  </div>

                  <div className="admin-photo-grid">
                    {story.story_photos.map((photo, photoIndex) => (
                      <div className="admin-photo" key={photo.id}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.image_url} alt={`${story.title}, photo ${photoIndex + 1}`} />
                        <button
                          type="button"
                          disabled={busy === `remove:${photo.id}`}
                          onClick={() => void handleRemovePhoto(story, photo)}
                          aria-label={`Remove photo ${photoIndex + 1} from ${story.title}`}
                        >
                          {busy === `remove:${photo.id}` ? "REMOVING…" : "REMOVE PHOTO"}
                        </button>
                      </div>
                    ))}
                    {story.story_photos.length === 0 && <p className="admin-empty-photos">No photos in this story yet.</p>}
                  </div>
                  <label className="admin-upload-button">
                    <span>{busy === `upload:${story.id}` ? "UPLOADING PHOTOS…" : "＋ ADD PHOTOS"}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      multiple
                      disabled={busy === `upload:${story.id}`}
                      onChange={(event) => void handleUpload(story, event)}
                    />
                  </label>
                </article>
              );
            })}
          </div></>}
        </section>
      )}
      {confirmation && (
        <div
          className="admin-confirm-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmation(null);
          }}
        >
          <section
            className="admin-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
            aria-describedby="admin-confirm-description"
          >
            <button
              className="admin-confirm-close"
              type="button"
              aria-label="Cancel"
              onClick={() => setConfirmation(null)}
            >
              ×
            </button>
            <div className={`admin-confirm-icon${confirmation.destructive ? " is-destructive" : ""}`} aria-hidden="true">
              {confirmation.destructive ? "!" : "?"}
            </div>
            <h2 id="admin-confirm-title">{confirmation.title}</h2>
            <p id="admin-confirm-description">{confirmation.description}</p>
            <div className="admin-confirm-actions">
              <button
                className="admin-confirm-cancel"
                type="button"
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className={`admin-confirm-submit${confirmation.destructive ? " is-destructive" : ""}`}
                type="button"
                onClick={() => {
                  const { onConfirm } = confirmation;
                  setConfirmation(null);
                  onConfirm();
                }}
              >
                {confirmation.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
      {sessionWarning && panelState === "admin" && (
        <div className="admin-session-backdrop">
          <section
            className="admin-confirm-dialog admin-session-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-warning-title"
            aria-describedby="session-warning-description"
          >
            <div className="admin-confirm-icon" aria-hidden="true">!</div>
            <h2 id="session-warning-title">Session expiring soon</h2>
            <p id="session-warning-description">
              You’ll be signed out in {sessionSecondsLeft} seconds. Continue your session or log out now.
            </p>
            <div className="admin-confirm-actions">
              <button
                className="admin-confirm-cancel"
                type="button"
                onClick={() => void handleSessionLogout()}
                disabled={sessionActionBusy}
              >
                {sessionActionBusy ? "PLEASE WAIT…" : "Log out"}
              </button>
              <button
                className="admin-confirm-submit"
                type="button"
                onClick={() => void handleContinueSession()}
                disabled={sessionActionBusy}
              >
                {sessionActionBusy ? "PLEASE WAIT…" : "Continue session"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
