"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useClickOutside } from "@/lib/use-click-outside";

export function ReviewPanelShell({
  closeHref,
  children,
}: {
  closeHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const { ref, open } = useClickOutside<HTMLDivElement>(true);

  useEffect(() => {
    if (!open) router.push(closeHref);
  }, [closeHref, open, router]);

  return <div ref={ref}>{children}</div>;
}