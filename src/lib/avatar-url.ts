export function getAvatarPublicUrl(avatarPath?: string | null) {
  if (!avatarPath) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");

  if (!supabaseUrl) {
    return null;
  }

  const encodedPath = avatarPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${supabaseUrl}/storage/v1/object/public/avatars/${encodedPath}`;
}
