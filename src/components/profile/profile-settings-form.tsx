"use client";

import { Camera, Check, LogOut, Trash2 } from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ChangePasswordForm } from "@/components/profile/change-password-form";
import { createClient } from "@/lib/supabase/client";

const avatarColors = [
  {
    value: "bg-blue-600",
    label: "Blue",
  },
  {
    value: "bg-purple-600",
    label: "Purple",
  },
  {
    value: "bg-pink-600",
    label: "Pink",
  },
  {
    value: "bg-rose-600",
    label: "Rose",
  },
  {
    value: "bg-orange-600",
    label: "Orange",
  },
  {
    value: "bg-emerald-600",
    label: "Emerald",
  },
  {
    value: "bg-cyan-600",
    label: "Cyan",
  },
  {
    value: "bg-indigo-600",
    label: "Indigo",
  },
] as const;

type ProfileSettingsFormProps = {
  userId: string;
  email: string;
  initialDisplayName: string;
  initialAvatarColor: string;
  initialAvatarPath: string | null;
  initialAvatarUrl: string | null;
};

async function resizeAvatar(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();

      element.onload = () => resolve(element);

      element.onerror = () =>
        reject(
          new Error("This image format could not be opened by your browser."),
        );

      element.src = objectUrl;
    });

    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);

    if (sourceSize <= 0) {
      throw new Error("Unable to read image dimensions.");
    }

    const sourceX = (image.naturalWidth - sourceSize) / 2;

    const sourceY = (image.naturalHeight - sourceSize) / 2;

    const canvas = document.createElement("canvas");

    const outputSize = 512;

    canvas.width = outputSize;

    canvas.height = outputSize;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to process image.");
    }

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      outputSize,
      outputSize,
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error("Unable to resize image."));

            return;
          }

          resolve(result);
        },
        "image/webp",
        0.86,
      );
    });

    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ProfileSettingsForm({
  userId,
  email,
  initialDisplayName,
  initialAvatarColor,
  initialAvatarPath,
  initialAvatarUrl,
}: ProfileSettingsFormProps) {
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(initialDisplayName);

  const [avatarColor, setAvatarColor] = useState(initialAvatarColor);

  const [avatarPath, setAvatarPath] = useState<string | null>(
    initialAvatarPath,
  );

  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);

  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    setSuccess("");

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");

      event.target.value = "";

      return;
    }

    /*
     * We resize before upload,
     * so this is only a browser
     * safety limit for the source.
     */
    if (file.size > 15 * 1024 * 1024) {
      setError("Please choose an image smaller than 15 MB.");

      event.target.value = "";

      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPreviewUrl(reader.result);
      }
    };

    reader.onerror = () => {
      setError("Unable to preview the selected image.");
    };

    reader.readAsDataURL(file);

    setPendingFile(file);

    event.target.value = "";
  }

  function removePhoto() {
    setPendingFile(null);

    setPreviewUrl(null);

    setAvatarPath(null);

    setAvatarUrl(null);

    setError("");
    setSuccess("");
  }

  async function saveProfile() {
    if (saving) {
      return;
    }

    const cleanName = displayName.trim();

    if (!cleanName) {
      setError("Display name is required.");

      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    let uploadedPath: string | null = null;

    let nextAvatarPath = avatarPath;

    try {
      /*
       * --------------------------------
       * New profile image
       * --------------------------------
       */
      if (pendingFile) {
        const resizedImage = await resizeAvatar(pendingFile);

        uploadedPath = `${userId}/${crypto.randomUUID()}.webp`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(uploadedPath, resizedImage, {
            contentType: "image/webp",

            upsert: false,

            cacheControl: "31536000",
          });

        if (uploadError) {
          throw uploadError;
        }

        nextAvatarPath = uploadedPath;
      }

      /*
       * --------------------------------
       * Update canonical profile
       * --------------------------------
       *
       * When path is null we omit
       * p_avatar_path so PostgreSQL's
       * default NULL is used.
       */
      const profileResult = nextAvatarPath
        ? await supabase.rpc("update_my_profile", {
            p_display_name: cleanName,

            p_avatar_color: avatarColor,

            p_avatar_path: nextAvatarPath,
          })
        : await supabase.rpc("update_my_profile", {
            p_display_name: cleanName,

            p_avatar_color: avatarColor,
          });

      if (profileResult.error) {
        /*
         * Don't leave an orphan
         * upload if profile update
         * fails.
         */
        if (uploadedPath) {
          await supabase.storage.from("avatars").remove([uploadedPath]);
        }

        throw profileResult.error;
      }

      /*
       * --------------------------------
       * Delete old profile image
       * --------------------------------
       */
      if (initialAvatarPath && initialAvatarPath !== nextAvatarPath) {
        const { error: deleteError } = await supabase.storage
          .from("avatars")
          .remove([initialAvatarPath]);

        if (deleteError) {
          console.error("Unable to delete old avatar:", deleteError);
        }
      }

      /*
       * Also handles replacing an
       * avatar again without a page
       * reload.
       */
      if (
        avatarPath &&
        avatarPath !== initialAvatarPath &&
        avatarPath !== nextAvatarPath
      ) {
        await supabase.storage.from("avatars").remove([avatarPath]);
      }

      let nextAvatarUrl: string | null = null;

      if (nextAvatarPath) {
        const { data } = supabase.storage
          .from("avatars")
          .getPublicUrl(nextAvatarPath);

        nextAvatarUrl = data.publicUrl;
      }

      setDisplayName(cleanName);

      setAvatarPath(nextAvatarPath);

      setAvatarUrl(nextAvatarUrl);

      setPendingFile(null);

      setPreviewUrl(null);

      setSuccess("Profile updated.");

      router.refresh();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to update profile.";

      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);

    setError("");

    const { error } = await supabase.auth.signOut();

    if (error) {
      setError(error.message);

      setSigningOut(false);

      return;
    }

    router.replace("/login");

    router.refresh();
  }

  const shownAvatarUrl = previewUrl ?? avatarUrl;

  const hasPhoto = Boolean(previewUrl || avatarUrl);

  return (
    <div className="space-y-7">
      {/* Avatar */}
      <section className="rounded-2xl border border-white/[0.08] bg-card p-5">
        <div className="flex flex-col items-center">
          <div className="relative">
            <ProfileAvatar
              name={displayName}
              avatarColor={avatarColor}
              avatarUrl={shownAvatarUrl}
              className="size-24 text-3xl shadow-xl"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Change profile picture"
              className="absolute bottom-0 right-0 flex size-9 items-center justify-center rounded-full border-4 border-card bg-blue-600 text-white shadow-lg"
            >
              <Camera className="size-4" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelection}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 text-sm font-semibold text-blue-400"
          >
            Change Photo
          </button>

          {hasPhoto && (
            <button
              type="button"
              onClick={removePhoto}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-400"
            >
              <Trash2 className="size-3.5" />
              Remove Photo
            </button>
          )}

          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
            Your photo is automatically cropped to a square and resized before
            upload.
          </p>
        </div>
      </section>

      {/* Display name */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Profile
        </h2>

        <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
          <label
            htmlFor="display-name"
            className="text-xs font-semibold text-muted-foreground"
          >
            Display Name
          </label>

          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={80}
            autoComplete="name"
            className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-blue-500"
          />
        </div>
      </section>

      {/* Avatar color */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Avatar Color
        </h2>

        <div className="rounded-2xl border border-white/[0.08] bg-card p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Used when you don&apos;t have a profile picture.
          </p>

          <div className="mt-4 grid grid-cols-8 gap-2">
            {avatarColors.map((color) => {
              const selected = avatarColor === color.value;

              return (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setAvatarColor(color.value)}
                  aria-label={color.label}
                  aria-pressed={selected}
                  className={`flex aspect-square items-center justify-center rounded-full ${color.value} ${
                    selected
                      ? "ring-2 ring-white ring-offset-2 ring-offset-card"
                      : ""
                  }`}
                >
                  {selected && <Check className="size-4 text-white" />}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Account */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Account
        </h2>

        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-card">
          <div className="px-4 py-4">
            <p className="text-xs text-muted-foreground">Email</p>

            <p className="mt-1 break-all text-sm font-semibold">{email}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Security
        </h2>

        <ChangePasswordForm email={email} />
      </section>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}

      <button
        type="button"
        onClick={saveProfile}
        disabled={saving || signingOut || !displayName.trim()}
        className="h-12 w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>

      {/* Sign out */}
      <section className="border-t border-white/[0.06] pt-7">
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut || saving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-500/10 text-sm font-semibold text-red-400 disabled:opacity-50"
        >
          <LogOut className="size-4" />

          {signingOut ? "Signing Out..." : "Sign Out"}
        </button>
      </section>
    </div>
  );
}
