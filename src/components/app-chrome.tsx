"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { isFullscreenRoute } from "@/lib/routes";

export function AppChrome({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const fullscreen = isFullscreenRoute(pathname);
  if (fullscreen) return null;

  return (
    <>
      <Sidebar isAdmin={isAdmin} />
      <CommandPalette isAdmin={isAdmin} />
    </>
  );
}
