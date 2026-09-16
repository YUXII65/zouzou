export const FULLSCREEN_ROUTES = [
  "/landing",
  "/login",
  "/onboarding",
  "/welcome",
  "/guest/register",
];

export function isFullscreenRoute(pathname: string) {
  return FULLSCREEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}