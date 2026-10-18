"use client";

// Wiring helper so each questionnaire records RQ2/RQ2b telemetry with two call sites:
// pass the id of the item currently on screen, then call answer() / complete().

import { useCallback, useEffect, useRef } from "react";
import { PillarId } from "@/lib/composite";
import { recordItem, recordPillarComplete, recordPillarStart } from "@/lib/telemetry";

export function usePillarTelemetry(
  pillar: PillarId,
  itemsFull: number,
  currentItemId: string | null
) {
  const pillarStart = useRef(Date.now());
  const itemShown = useRef(Date.now());
  const asked = useRef<Set<string>>(new Set());

  useEffect(() => {
    recordPillarStart(pillar);
  }, [pillar]);

  // Reset the per-item clock whenever a new item comes on screen, and count it as asked.
  useEffect(() => {
    if (!currentItemId) return;
    itemShown.current = Date.now();
    asked.current.add(currentItemId);
  }, [currentItemId]);

  const answer = useCallback(
    (itemId: string, value: number | null) => {
      recordItem(pillar, itemId, value, Date.now() - itemShown.current);
    },
    [pillar]
  );

  const complete = useCallback(
    (score: number) => {
      recordPillarComplete(
        pillar,
        score,
        asked.current.size,
        itemsFull,
        Date.now() - pillarStart.current
      );
    },
    [pillar, itemsFull]
  );

  return { answer, complete };
}
