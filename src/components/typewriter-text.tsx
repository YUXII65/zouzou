"use client";

import { useEffect, useState } from "react";

export function TypewriterText({
  text,
  className,
  animate = true,
}: {
  text: string;
  className?: string;
  animate?: boolean;
}) {
  const [displayed, setDisplayed] = useState(() => (animate ? 0 : text.length));
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!animate || reducedMotion) {
      setDisplayed(text.length);
      return;
    }

    setDisplayed((current) => Math.min(current, text.length));
    const step = Math.max(1, Math.ceil(text.length / 90));
    const timer = window.setInterval(() => {
      setDisplayed((current) => {
        if (current >= text.length) return current;
        return Math.min(text.length, current + step);
      });
    }, 16);
    return () => window.clearInterval(timer);
  }, [animate, reducedMotion, text]);

  const visible = text.slice(0, displayed);
  return (
    <span className={className} aria-live="polite">
      {visible}
      {displayed < text.length ? (
        <span className="ml-0.5 inline-block animate-pulse text-accent" aria-hidden>
          |
        </span>
      ) : null}
    </span>
  );
}
