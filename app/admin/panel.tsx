"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from "react";
import { detectImageMimeType, MAX_IMAGE_SIZE_BYTES } from "@/lib/image-validation";
import type { TelegramPackage } from "@/lib/telegram-packages";
import {
  getAdminSessionAction,
  loginAdminAction,
  logoutAdminAction,
  refreshAdminSessionAction,
  getAdminStoriesAction,
  getAdminHeroBackgroundAction,
  getAdminTelegramPackagesAction,
  createStoryAction,
  saveStoryAction,
  deleteStoryAction,
  removePhotoAction,
  createTelegramPackageAction,
  saveTelegramPackageAction,
  deleteTelegramPackageAction,
  uploadAdminImageAction,
  type AdminStory,
  type AdminStoryPhoto,
  type AdminHeroBackground,
} from "@/app/actions/admin";

type Photo = AdminStoryPhoto;
type Story = AdminStory;
type PackageDraft = Pick<TelegramPackage, "title" | "price" | "details">;
type HeroBackground = AdminHeroBackground;

type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  onConfirm: () => void;
};

type PanelState = "checking" | "signed-out" | "not-admin" | "setup-error" | "admin";
type AdminSection = "collections" | "telegram";

const ADMIN_SESSION_DURATION_MS = 5 * 60 * 1000;
const SESSION_WARNING_DURATION_MS = 60 * 1000;
const ADMIN_SESSION_STARTED_AT_KEY = "admin-session-started-at";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function AdminPanel({ section = "collections" }: { section?: AdminSection }) {
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

  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (!confirmation && !error) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (error) {
          setError("");
        } else if (confirmation) {
          setConfirmation(null);
        }
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [confirmation, error]);

  const loadStories = useCallback(async () => {
    const result = await getAdminStoriesAction();
    if (!result.success) {
      throw new Error(result.error || "Unable to load collections.");
    }
    const orderedStories = result.stories ?? [];
    setStories(orderedStories);
    setDrafts(
      Object.fromEntries(
        orderedStories.map(({ id, title, category, year }) => [id, { title, category, year }]),
      ),
    );
  }, []);

  const loadHeroBackground = useCallback(async () => {
    const result = await getAdminHeroBackgroundAction();
    if (!result.success) {
      throw new Error(result.error || "Unable to load homepage background.");
    }
    setHeroBackground(result.heroBackground ?? null);
  }, []);

  const loadTelegramPackages = useCallback(async () => {
    const result = await getAdminTelegramPackagesAction();
    if (!result.success) {
      throw new Error(result.error || "Unable to load Telegram packages.");
    }
    const orderedPackages = result.packages ?? [];
    setTelegramPackages(orderedPackages);
    setPackageDrafts(
      Object.fromEntries(
        orderedPackages.map(({ id, title, price, details }) => [id, { title, price, details }]),
      ),
    );
  }, []);

  const verifyAccess = useCallback(async () => {
    const sessionRes = await getAdminSessionAction();

    if (sessionRes.status === "signed-out") {
      setPanelState("signed-out");
      setSessionExpiresAt(null);
      return;
    }

    if (sessionRes.status === "setup-error") {
      setError(
        sessionRes.error ||
          "The admin tables are missing from Supabase. Run migrations in the Supabase SQL Editor.",
      );
      setPanelState("setup-error");
      return;
    }

    if (sessionRes.status === "not-admin") {
      setError(sessionRes.error || "Access restricted. You are not on the authorized admin list.");
      setPanelState("not-admin");
      return;
    }

    try {
      if (section === "telegram") {
        await loadTelegramPackages();
      } else {
        await loadStories();
        await loadHeroBackground();
      }
      setPanelState("admin");

      const storedStartedAt = Number(sessionStorage.getItem(ADMIN_SESSION_STARTED_AT_KEY));
      const startedAt =
        Number.isFinite(storedStartedAt) && storedStartedAt > 0 ? storedStartedAt : Date.now();
      sessionStorage.setItem(ADMIN_SESSION_STARTED_AT_KEY, String(startedAt));
      setSessionExpiresAt(startedAt + ADMIN_SESSION_DURATION_MS);
    } catch (loadError) {
      setError(`Unable to load content: ${errorMessage(loadError)}`);
      setPanelState("admin");
    }
  }, [section, loadStories, loadHeroBackground, loadTelegramPackages]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void verifyAccess();
    }, 0);
    return () => clearTimeout(timer);
  }, [verifyAccess]);

  useEffect(() => {
    if (!sessionExpiresAt) return;

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
      setSessionExpiresAt(null);
      sessionStorage.removeItem(ADMIN_SESSION_STARTED_AT_KEY);
      try {
        await logoutAdminAction();
      } catch (logoutError) {
        setError(`Unable to sign out after session timeout: ${errorMessage(logoutError)}`);
      }
      setPanelState("signed-out");
    }

    const warningTimer =
      warningDelay === 0 ? undefined : setTimeout(startWarningCountdown, warningDelay);
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
  }, [sessionExpiresAt]);

  async function handleContinueSession() {
    if (sessionActionBusy) return;
    setSessionActionBusy(true);
    setError("");

    try {
      const result = await refreshAdminSessionAction();
      if (!result.success) {
        setError(result.error || "Unable to continue your session. Please sign in again.");
        return;
      }
      const startedAt = Date.now();
      sessionStorage.setItem(ADMIN_SESSION_STARTED_AT_KEY, String(startedAt));
      setSessionExpiresAt(startedAt + ADMIN_SESSION_DURATION_MS);
      setSessionWarning(false);
    } catch (refreshError) {
      setError(`Unable to continue your session: ${errorMessage(refreshError)}`);
    } finally {
      setSessionActionBusy(false);
    }
  }

  async function handleSessionLogout() {
    if (sessionActionBusy) return;
    setSessionActionBusy(true);
    setError("");

    try {
      await logoutAdminAction();
      sessionStorage.removeItem(ADMIN_SESSION_STARTED_AT_KEY);
      setSessionExpiresAt(null);
      setSessionWarning(false);
      setPanelState("signed-out");
    } catch (logoutError) {
      setError(`Unable to sign out: ${errorMessage(logoutError)}`);
    } finally {
      setSessionActionBusy(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy("login");

    try {
      const result = await loginAdminAction({ email, password });
      if (!result.success) {
        if (result.status === "setup-error") {
          setError(result.error || "Admin setup required in Supabase.");
          setPanelState("setup-error");
        } else if (result.status === "not-admin") {
          setError(result.error || "This account is not on the authorized admin list.");
          setPanelState("not-admin");
        } else {
          setError(result.error || "Unable to sign in. Check your credentials.");
        }
      } else {
        setPassword("");
        const startedAt = Date.now();
        sessionStorage.setItem(ADMIN_SESSION_STARTED_AT_KEY, String(startedAt));
        setSessionExpiresAt(startedAt + ADMIN_SESSION_DURATION_MS);
        try {
          if (section === "telegram") {
            await loadTelegramPackages();
          } else {
            await loadStories();
            await loadHeroBackground();
          }
          setPanelState("admin");
        } catch (loadError) {
          setError(`Unable to load content: ${errorMessage(loadError)}`);
          setPanelState("admin");
        }
      }
    } catch (loginError) {
      setError(`Unable to sign in: ${errorMessage(loginError)}`);
    } finally {
      setBusy("");
    }
  }

  function handleLogout() {
    setConfirmation({
      title: "Sign out?",
      description: "Are you sure you want to end your admin session?",
      confirmLabel: "Sign out",
      destructive: true,
      onConfirm: () => void performLogout(),
    });
  }

  async function performLogout() {
    setError("");
    try {
      await logoutAdminAction();
      sessionStorage.removeItem(ADMIN_SESSION_STARTED_AT_KEY);
      setSessionExpiresAt(null);
      setSessionWarning(false);
      setPanelState("signed-out");
    } catch (logoutError) {
      setError(`Unable to sign out: ${errorMessage(logoutError)}`);
    }
  }

  async function handleCreateStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy("create-story");

    try {
      const res = await createStoryAction(newStory);
      if (!res.success) {
        setError(`Unable to add featured story: ${res.error}`);
        setBusy("");
        return;
      }
      setNewStory({ title: "", category: "", year: "" });
      setMessage("Featured story added.");
      await loadStories();
    } catch (createError) {
      setError(`Unable to add featured story: ${errorMessage(createError)}`);
    } finally {
      setBusy("");
    }
  }

  async function handleSaveStory(storyId: string) {
    const draft = drafts[storyId];
    if (!draft) return;
    setError("");
    setMessage("");
    setBusy(`save:${storyId}`);

    try {
      const res = await saveStoryAction(storyId, draft);
      if (!res.success) {
        setError(`Unable to save story: ${res.error}`);
        setBusy("");
        return;
      }
      setMessage("Story details saved.");
      await loadStories();
    } catch (saveError) {
      setError(`Unable to save story: ${errorMessage(saveError)}`);
    } finally {
      setBusy("");
    }
  }

  async function handleCreatePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy("create-package");

    try {
      const res = await createTelegramPackageAction(newPackage);
      if (!res.success) throw new Error(res.error);

      setNewPackage({ title: "", price: "", details: "" });
      await loadTelegramPackages();
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

    setConfirmation({
      title: "Save package changes?",
      description: `Save the updated details for “${draft.title.trim()}” and apply them to the Telegram bot?`,
      confirmLabel: "Save changes",
      destructive: false,
      onConfirm: () => void savePackage(packageId, draft),
    });
  }

  async function savePackage(packageId: string, draft: PackageDraft) {
    setError("");
    setMessage("");
    setBusy(`save-package:${packageId}`);

    try {
      const res = await saveTelegramPackageAction(packageId, draft);
      if (!res.success) throw new Error(res.error);

      await loadTelegramPackages();
      setMessage("Telegram package saved.");
    } catch (saveError) {
      setError(`Unable to save Telegram package: ${errorMessage(saveError)}`);
    } finally {
      setBusy("");
    }
  }

  function handleDeletePackage(photoPackage: TelegramPackage) {
    setConfirmation({
      title: "Delete this Telegram package?",
      description: `“${photoPackage.title}” will be removed from the bot. This cannot be undone.`,
      confirmLabel: "Delete package",
      destructive: true,
      onConfirm: () => void deletePackage(photoPackage),
    });
  }

  async function deletePackage(photoPackage: TelegramPackage) {
    setError("");
    setMessage("");
    setBusy(`delete-package:${photoPackage.id}`);

    try {
      const res = await deleteTelegramPackageAction(photoPackage.id);
      if (!res.success) throw new Error(res.error);

      await loadTelegramPackages();
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

    const invalidFile = await Promise.all(
      files.map(async (file) => ({
        file,
        isValid:
          file.size <= MAX_IMAGE_SIZE_BYTES &&
          detectImageMimeType(
            new Uint8Array(await file.slice(0, 512).arrayBuffer()),
            file.name || file.type,
          ) !== null,
      })),
    ).then((checked) => checked.find(({ isValid }) => !isValid)?.file);

    if (invalidFile) {
      setError(`${invalidFile.name} must be a valid image file no larger than 20 MB.`);
      return;
    }

    const photoLabel = files.length === 1 ? "photo" : `${files.length} photos`;
    setConfirmation({
      title: files.length === 1 ? "Add this file?" : "Add these files?",
      description: `Add ${photoLabel} to “${story.title}”?`,
      confirmLabel: "Add",
      destructive: false,
      onConfirm: () => void uploadPhotos(story, files),
    });
  }

  async function uploadPhotos(story: Story, files: File[]) {
    setError("");
    setMessage("");
    setBusy(`upload:${story.id}`);
    let uploadedCount = 0;

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("purpose", "story-photo");
        formData.set("storyId", story.id);
        formData.set("file", file);

        const res = await uploadAdminImageAction(formData);
        if (!res.success) {
          throw new Error(res.error || "Failed to upload photo.");
        }
        uploadedCount += 1;
      }
    } catch (uploadError) {
      let refreshWarning = "";
      if (uploadedCount > 0) {
        try {
          await loadStories();
        } catch (loadError) {
          refreshWarning = ` The gallery could not refresh: ${errorMessage(loadError)}`;
        }
      }
      const partialResult = uploadedCount
        ? ` ${uploadedCount} photo${uploadedCount === 1 ? " was" : "s were"} saved successfully.`
        : "";
      setError(`Unable to add photos: ${errorMessage(uploadError)}${partialResult}${refreshWarning}`);
      setBusy("");
      return;
    }

    setMessage(`${uploadedCount} photo${uploadedCount === 1 ? "" : "s"} added.`);
    try {
      await loadStories();
    } catch (loadError) {
      setError(`Photos were uploaded, but the list could not refresh: ${errorMessage(loadError)}`);
    }
    setBusy("");
  }

  async function handleHeroBackgroundUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (
      file.size > MAX_IMAGE_SIZE_BYTES ||
      !detectImageMimeType(
        new Uint8Array(await file.slice(0, 512).arrayBuffer()),
        file.name || file.type,
      )
    ) {
      setError(`${file.name} must be a valid image file no larger than 20 MB.`);
      return;
    }

    setConfirmation({
      title: "Change this background photo?",
      description: "This photo will replace the current homepage background.",
      confirmLabel: "Change photo",
      destructive: false,
      onConfirm: () => void saveHeroBackground(file),
    });
  }

  async function saveHeroBackground(file: File) {
    setError("");
    setMessage("");
    setBusy("hero-background");

    try {
      const formData = new FormData();
      formData.set("purpose", "hero-background");
      formData.set("file", file);

      const res = await uploadAdminImageAction(formData);
      if (!res.success || !res.imageUrl) {
        throw new Error(res.error || "Unable to upload hero background.");
      }
      setHeroBackground({ value: res.imageUrl, storage_path: null });
      setMessage("Homepage background photo updated.");
    } catch (uploadError) {
      setError(`Unable to upload the hero background: ${errorMessage(uploadError)}`);
    } finally {
      setBusy("");
    }
  }

  async function handleRemovePhoto(story: Story, photo: Photo) {
    setConfirmation({
      title: "Remove this file?",
      description: `This photo will be removed from “${story.title}”.`,
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: () => void removePhoto(story, photo),
    });
  }

  async function removePhoto(story: Story, photo: Photo) {
    setError("");
    setMessage("");
    setBusy(`remove:${photo.id}`);

    try {
      const res = await removePhotoAction(photo.id, photo.storage_path);
      if (!res.success) {
        setError(`Unable to remove photo: ${res.error}`);
        setBusy("");
        return;
      }
      if (res.warning) {
        setError(res.warning);
      } else {
        setMessage(`Photo removed from “${story.title}”.`);
      }
      await loadStories();
    } catch (removeError) {
      setError(`Unable to remove photo: ${errorMessage(removeError)}`);
    } finally {
      setBusy("");
    }
  }

  function handleDeleteStory(story: Story) {
    setConfirmation({
      title: "Delete this featured story?",
      description: `“${story.title}” and its ${story.story_photos.length} photo${story.story_photos.length === 1 ? "" : "s"} will be removed from the portfolio. This cannot be undone.`,
      confirmLabel: "Delete story",
      destructive: true,
      onConfirm: () => void deleteStory(story),
    });
  }

  async function deleteStory(story: Story) {
    setError("");
    setMessage("");
    setBusy(`delete-story:${story.id}`);

    try {
      const res = await deleteStoryAction(story.id);
      if (!res.success) {
        setError(`Unable to delete featured story: ${res.error}`);
        setBusy("");
        return;
      }
      if (res.warning) {
        setError(res.warning);
      } else {
        setMessage(`Featured story “${story.title}” deleted.`);
      }
      await loadStories();
    } catch (deleteError) {
      setError(`Unable to delete featured story: ${errorMessage(deleteError)}`);
    } finally {
      setBusy("");
    }
  }

  if (panelState === "checking") {
    return (
      <main className="admin-page">
        <header className="admin-topbar">
          <Link className="admin-brand" href="/">AO PHOTOGRAPHY</Link>
          <Link className="admin-back-link" href="/">VIEW WEBSITE <span aria-hidden="true">↗</span></Link>
        </header>
        <section className="admin-auth" style={{ textAlign: "center" }}>
          <p className="admin-status">Checking admin access…</p>
        </section>
      </main>
    );
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
                  accept="image/*,.heic,.heif"
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
                      accept="image/*,.heic,.heif"
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
      {error && (
        <div
          className="admin-error-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setError("");
          }}
        >
          <section
            className="admin-error-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-error-title"
            aria-describedby="admin-error-description"
          >
            <button
              className="admin-error-close"
              type="button"
              aria-label="Close error log"
              onClick={() => setError("")}
            >
              ×
            </button>
            <div className="admin-error-icon" aria-hidden="true">
              !
            </div>
            <h2 id="admin-error-title">Action Failed</h2>
            <p className="admin-error-subtitle">The following error occurred during the operation:</p>
            <div id="admin-error-description" className="admin-error-body">
              <pre className="admin-error-message">{error}</pre>
            </div>
            <div className="admin-error-actions">
              <button
                className="admin-error-copy"
                type="button"
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard
                      .writeText(error)
                      .then(() => {
                        setCopyStatus("Copied!");
                        setTimeout(() => setCopyStatus(""), 2000);
                      })
                      .catch(() => {});
                  }
                }}
              >
                {copyStatus || "Copy Error Log"}
              </button>
              <button
                className="admin-error-dismiss"
                type="button"
                onClick={() => setError("")}
              >
                Dismiss
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
