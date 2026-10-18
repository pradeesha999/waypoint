"use client";

// Line icons for the six areas.
//
//  These replace the emoji the app shipped with. Emoji render differently on every platform, carry
//  a tone the sensitive questions don't want, and can't inherit colour — which is most of why the
//  pillar cards read as unfinished. Drawn on a 24px grid, 1.6 stroke, currentColor.

import { PillarId } from "@/lib/composite";

const P: Record<PillarId, string[]> = {
  // running figure
  activity: ["M13 4.5a1.6 1.6 0 1 0 0-.01", "M9.5 20l2-5 3-2-1-4", "M8 11l3.5-2 3 1 2.5 3", "M6.5 15.5l2-1.5", "M16 21l-1.5-4"],
  // moon
  sleep: ["M20 14.5A8 8 0 0 1 9.5 4a8.2 8.2 0 1 0 10.5 10.5z"],
  // leaf on a stem
  nutrition: ["M5 20c0-6 4-11 14-12 0 8-4 12-10 12H5z", "M5 20c2-4 5-6 9-7.5"],
  // person in calm posture
  stress: ["M12 5.5a1.6 1.6 0 1 0 0-.01", "M12 9v5", "M8 19c0-2.5 1.8-4 4-4s4 1.5 4 4", "M7.5 12.5 12 14l4.5-1.5"],
  // two figures
  social: ["M9 9.5a2.2 2.2 0 1 0 0-.01", "M4.5 19c0-2.6 2-4.4 4.5-4.4s4.5 1.8 4.5 4.4", "M15.5 8.4a2 2 0 1 0 0-.01", "M15 14.9c2.3.2 4 1.9 4 4.1"],
  // struck-through circle
  substances: ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z", "M6 18 18 6"],
};

export default function PillarIcon({
  id,
  size = 22,
}: {
  id: PillarId;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[id].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
