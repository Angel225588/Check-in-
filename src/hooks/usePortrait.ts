"use client";
import { useState, useEffect } from "react";

/**
 * Is this the tall, one-thumb layout?
 *
 * Deliberately not "is the viewport narrow". A landscape iPad zoomed to 150%
 * reports 796 CSS pixels wide and is still a landscape iPad: two hands, a desk,
 * an eye that reads left and a hand that rests right. Switching it to the
 * portrait shell would be a worse screen, not a smaller one.
 *
 * So both halves are required — narrow AND taller than wide. That is a phone,
 * or an iPad stood up, and nothing else.
 */
const QUERY = "(max-width: 1023px) and (orientation: portrait)";

export function usePortrait(): boolean {
  // Server-render and first paint as landscape. Guessing portrait would flash
  // the wrong shell on the tablet, which is the device that matters.
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const apply = () => setPortrait(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return portrait;
}
