"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import type { ProfileUser } from "@/components/profile-card";
import { isFullscreenRoute } from "@/lib/routes";


export function AppChrome({
  isAdmin,
  user,
}: {
  isAdmin: boolean;
  user: ProfileUser | null;
}) {
  const pathname = usePathname();
  const fullscreen = isFullscreenRoute(pathname);
  if (fullscreen) return null;

  return (
    <>
      <Sidebar isAdmin={isAdmin} user={user} />
      <CommandPalette isAdmin={isAdmin} />
    </>
  );
}