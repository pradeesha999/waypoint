"use client";

// In the unified flow each pillar runs as a "chapter": it skips its own intro screen, and when its
// last question is answered it hands the score back to the parent instead of rendering its own
// result page. The parent then shows one merged transition screen (see Docs/Assessment_Flow_Spec.md
// §4) — which is what keeps six domain boundaries from becoming twelve extra screens.

import { useEffect, useRef } from "react";

export default function ChapterHandoff({
  score,
  onDone,
}: {
  score: number;
  onDone?: (score: number) => void;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    onDone?.(score);
  }, [score, onDone]);
  return null;
}
