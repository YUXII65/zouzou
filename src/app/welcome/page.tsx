import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isGuestUser, requireUser } from "@/lib/auth";
import { isOnboardingCompletedValue } from "@/lib/onboarding";
import { FirstRunGuide } from "./first-run-guide";

export const metadata: Metadata = {
  title: "让想法，走成下一步",
  description: "说出真实想法，记住方向，然后走出第一步",
};

export const dynamic = "force-dynamic";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const signupEvent =
    params.signup === "guest"
      ? "guest_start"
      : params.signup === "register"
        ? "register"
        : null;
  const user = await requireUser();
  if (isOnboardingCompletedValue(user.userPreferences[0]?.value)) {
    redirect("/workspace");
  }

  return <FirstRunGuide guest={isGuestUser(user)} signupEvent={signupEvent} />;
}
