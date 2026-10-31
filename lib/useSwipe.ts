"use client";

import { useCallback, useRef, useState } from "react";

export type SwipeDirection = "left" | "right" | "up";

type UseSwipeOptions = {
  onSwipe: (direction: SwipeDirection) => void;
  /** px past which a horizontal drag commits. */
  threshold?: number;
  /** px upward drag that triggers the "up" action. */
  upThreshold?: number;
  disabled?: boolean;
};

/**
 * Pointer swipe for the top deck card.
 * Axis-locks after a few pixels: horizontal = drag the card, vertical = leave
 * scrolling to the inner card body (so long tweets don't fight the swipe).
 */
export function useSwipe({
  onSwipe,
  threshold = 110,
  upThreshold = 120,
  disabled = false
}: UseSwipeOptions) {
  const [offset, setOffset] = useState({ dx: 0, dy: 0, active: false });
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"pending" | "x" | "y">("pending");
  const latest = useRef({ dx: 0, dy: 0 });
  const flinging = useRef(false);
  const pointerId = useRef<number | null>(null);

  const reset = useCallback(() => {
    start.current = null;
    axis.current = "pending";
    pointerId.current = null;
    latest.current = { dx: 0, dy: 0 };
    setOffset({ dx: 0, dy: 0, active: false });
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (disabled || flinging.current) return;
      // Ignore interactive children (links, buttons) so "Open" still works.
      const target = event.target as HTMLElement;
      if (target.closest("a, button, input, textarea")) return;
      start.current = { x: event.clientX, y: event.clientY };
      axis.current = "pending";
      pointerId.current = event.pointerId;
      latest.current = { dx: 0, dy: 0 };
      setOffset({ dx: 0, dy: 0, active: true });
    },
    [disabled]
  );

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!start.current || pointerId.current !== event.pointerId) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;

    if (axis.current === "pending") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis.current === "x") {
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      } else {
        // Vertical intent → let the card body scroll; abort swipe tracking.
        reset();
        return;
      }
    }

    if (axis.current !== "x") return;
    event.preventDefault();
    latest.current = { dx, dy };
    setOffset({ dx, dy, active: true });
  }, [reset]);

  const finish = useCallback(() => {
    if (!start.current) return;
    const { dx, dy } = latest.current;
    const locked = axis.current;
    if (locked === "x") {
      if (dy < -upThreshold && Math.abs(dy) > Math.abs(dx) * 1.2) {
        onSwipe("up");
      } else if (Math.abs(dx) > threshold) {
        onSwipe(dx > 0 ? "right" : "left");
      }
    }
    reset();
  }, [onSwipe, reset, threshold, upThreshold]);

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (pointerId.current !== null && event.pointerId !== pointerId.current) return;
      finish();
    },
    [finish]
  );

  const flingTo = useCallback(
    (direction: SwipeDirection) => {
      if (flinging.current) return;
      flinging.current = true;
      const target =
        direction === "left"
          ? { dx: -600, dy: 40 }
          : direction === "right"
            ? { dx: 600, dy: 40 }
            : { dx: 0, dy: -600 };
      setOffset({ ...target, active: false });
      window.setTimeout(() => {
        onSwipe(direction);
        flinging.current = false;
        reset();
      }, 220);
    },
    [onSwipe, reset]
  );

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp
    },
    dx: offset.dx,
    dy: offset.dy,
    active: offset.active,
    flingTo
  };
}
