"use client";
import { useState, useEffect, useRef } from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
  prefix?: string;
  format?: (n: number) => string;
}

/**
 * Animated counter that smoothly counts from 0 (or previous value) to target value.
 * Uses requestAnimationFrame with easeOutExpo for a premium feel.
 * Includes a 100ms mount delay so the "0" state is visible before counting up.
 */
export default function AnimatedNumber({
  value,
  duration = 600,
  className = "",
  suffix = "",
  prefix = "",
  format,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);
  const frameRef = useRef<number>(0);
  const mounted = useRef(false);

  useEffect(() => {
    const from = prevValue.current;
    const to = value;
    const diff = to - from;
    if (diff === 0) return;

    // On first animation, add a small delay so "0" is visible
    const delay = !mounted.current && from === 0 ? 150 : 0;
    mounted.current = true;

    const timeoutId = setTimeout(() => {
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutExpo: fast start, smooth deceleration
        const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const current = Math.round(from + diff * eased);
        setDisplay(current);

        if (progress < 1) {
          frameRef.current = requestAnimationFrame(animate);
        } else {
          prevValue.current = to;
        }
      };

      frameRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  const formatted = format ? format(display) : String(display);

  return (
    <span className={className}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
