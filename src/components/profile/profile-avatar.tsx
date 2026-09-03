import { getAvatarPublicUrl } from "@/lib/avatar-url";

type ProfileAvatarProps = {
  name: string;
  avatarColor: string;

  avatarPath?: string | null;

  avatarUrl?: string | null;

  className?: string;
};

export function ProfileAvatar({
  name,
  avatarColor,
  avatarPath,
  avatarUrl,
  className = "",
}: ProfileAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  /*
   * avatarUrl is primarily used by the
   * Profile editor for an unsaved preview.
   *
   * Everywhere else can simply supply
   * avatarPath.
   */
  const resolvedAvatarUrl = avatarUrl ?? getAvatarPublicUrl(avatarPath);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ${avatarColor} ${className}`}
      style={
        resolvedAvatarUrl
          ? {
              backgroundImage: `url("${resolvedAvatarUrl}")`,

              backgroundPosition: "center",

              backgroundSize: "cover",

              backgroundRepeat: "no-repeat",
            }
          : undefined
      }
    >
      {!resolvedAvatarUrl && initial}
    </div>
  );
}
