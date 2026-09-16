import { prisma } from "@/lib/prisma";
import { ONBOARDING_PREFERENCE } from "@/lib/preferences";

export async function isOnboardingCompleted(userId: string) {
  const preference = await prisma.userPreference.findUnique({
    where: {
      userId_key_source: {
        userId,
        key: ONBOARDING_PREFERENCE.key,
        source: ONBOARDING_PREFERENCE.source,
      },
    },
    select: { value: true },
  });

  return isOnboardingCompletedValue(preference?.value);
}

export function isOnboardingCompletedValue(value: string | null | undefined) {
  return value === "true";
}

export async function setOnboardingCompleted(
  userId: string,
  completed: boolean,
) {
  await prisma.userPreference.upsert({
    where: {
      userId_key_source: {
        userId,
        key: ONBOARDING_PREFERENCE.key,
        source: ONBOARDING_PREFERENCE.source,
      },
    },
    update: { value: completed ? "true" : "false" },
    create: {
      userId,
      key: ONBOARDING_PREFERENCE.key,
      source: ONBOARDING_PREFERENCE.source,
      value: completed ? "true" : "false",
    },
  });
}
