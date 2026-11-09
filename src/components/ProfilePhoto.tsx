import { useState, type ReactNode } from "react";
import { useSession } from "../lib/cloud.ts";
import { avatarUrl, useMyProfile } from "../lib/community.ts";

/** My community profile photo when I have one, otherwise `fallback` (my initial). */
export default function ProfilePhoto({ fallback }: { fallback: ReactNode }) {
  const session = useSession();
  const { profile } = useMyProfile(session?.user.id ?? null);
  const [broken, setBroken] = useState<string | null>(null);
  const url = avatarUrl(profile?.avatar_path);
  if (url && broken !== url) return <img className="avatar-photo" src={url} alt="" onError={() => setBroken(url)} />;
  return <>{fallback}</>;
}
