export function safeNext(value: string | null) {
  if (!value) return "/";

  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/";
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("\\")
  ) {
    return "/";
  }

  try {
    const base = "https://next-step.invalid";
    const parsed = new URL(decoded, base);
    if (parsed.origin !== base) return "/";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return "/";
  }
}
