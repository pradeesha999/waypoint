"use client";

/**
 * Bloom — the one memorable object in the app, doing three jobs at once:
 * progress indicator, score display, and reward.
 *
 * Six segments because the model genuinely HAS six pillars. The shape encodes real information
 * rather than decorating: each wedge is one domain, filling from the inner radius outward in
 * proportion to that domain's 0-100 score, coloured by its display band. The centre carries the
 * composite and an n/6 counter. Nothing about what is asked or how it scores changes — this is a
 * different way of drawing numbers the app already computes.
 *
 * Why it replaces a second progress bar rather than adding one: a participant part-way through can
 * see, in a single glance, how much of the task is banked and what it is worth. That is the same
 * "show the whole shape of the task" benefit a domain menu would give, without reintroducing the
 * six new-section screens that D28 removed on the evidence of Chen et al. (2022).
 *
 * ACCESSIBILITY. Colour is never the only signal: pass `legend` (or render one alongside) so every
 * filled segment also appears as a name and a number. When the Bloom is decoration — the landing
 * preview — pass `decorative` and it leaves the accessibility tree entirely.
 *
 * MOTION. Only the segment named by `justFilled` animates, and it animates a CSS `transform` on the
 * clip geometry, never the path `d`. Animating `d` is not compositor-friendly and does not interpolate
 * at all in several browsers. Under `prefers-reduced-motion: reduce` the segment simply arrives
 * already filled.
 */

import { PillarId } from "@/lib/composite";
import { bandToken } from "@/lib/bands";

/** Journey order — segments fill clockwise in the order the participant answers them. */
export const BLOOM_ORDER: { id: PillarId; label: string }[] = [
  { id: "activity", label: "Physical activity" },
  { id: "sleep", label: "Sleep" },
  { id: "nutrition", label: "Nutrition" },
  { id: "social", label: "Social connection" },
  { id: "stress", label: "Stress" },
  { id: "substances", label: "Alcohol & tobacco" },
];

const HALF_ANGLE = 27; // degrees either side of centre — leaves a 6° gap between wedges
const R_INNER = 0.17; // as a fraction of size
const R_OUTER = 0.46;
const MIN_FILL = 0.08; // a completed domain scoring 0 must still read as completed, not missing

/** Annular wedge from the inner radius to the outer radius, centred on `angle` degrees. */
function wedge(size: number, angle: number): string {
  const c = size / 2;
  const ri = size * R_INNER;
  const ro = size * R_OUTER;
  const a0 = ((angle - HALF_ANGLE) * Math.PI) / 180;
  const a1 = ((angle + HALF_ANGLE) * Math.PI) / 180;
  const p = (r: number, a: number) => `${c + r * Math.sin(a)},${c - r * Math.cos(a)}`;
  return [
    `M ${p(ri, a0)}`,
    `L ${p(ro, a0)}`,
    `A ${ro} ${ro} 0 0 1 ${p(ro, a1)}`,
    `L ${p(ri, a1)}`,
    `A ${ri} ${ri} 0 0 0 ${p(ri, a0)}`,
    "Z",
  ].join(" ");
}

export default function Bloom({
  scores,
  size = 200,
  justFilled = null,
  composite,
  decorative = false,
  className = "",
}: {
  scores: Partial<Record<PillarId, number>>;
  size?: number;
  /** The domain that has just been answered — the only one that animates. */
  justFilled?: PillarId | null;
  /** Number shown in the centre. Pass the composite; omit to show a dash. */
  composite?: number | null;
  decorative?: boolean;
  className?: string;
}) {
  const c = size / 2;
  const ri = size * R_INNER;
  const ro = size * R_OUTER;
  const done = BLOOM_ORDER.filter((d) => typeof scores[d.id] === "number");

  const label = decorative
    ? undefined
    : done.length === 0
    ? "Your six health areas — none answered yet."
    : `Your six health areas. ${done
        .map((d) => `${d.label} ${Math.round(scores[d.id] as number)} out of 100`)
        .join(". ")}. ${done.length} of 6 answered.`;

  return (
    <svg
      className={`bloom ${className}`}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={label}
      focusable="false"
    >
      <defs>
        {BLOOM_ORDER.map((d, i) => {
          const raw = scores[d.id];
          if (typeof raw !== "number") return null;
          const fill = Math.max(MIN_FILL, Math.min(1, raw / 100));
          // Two scale factors: `--k0` is the inner radius (where the petal starts) and `--k` is
          // where this score lands. The animation between them is declared in CSS, so it needs no
          // state, no timer and no second render — and under reduced motion the rule simply does
          // not apply, leaving the inline `scale(var(--k))` and a petal that arrives already full.
          const k = (ri + (ro - ri) * fill) / ro;
          return (
            <clipPath key={d.id} id={`bloom-clip-${i}`} clipPathUnits="userSpaceOnUse">
              <circle
                cx={c}
                cy={c}
                r={ro}
                className={justFilled === d.id ? "bloom-grow" : undefined}
                style={
                  {
                    "--k0": ri / ro,
                    "--k": k,
                    transform: `scale(${k})`,
                    transformOrigin: `${c}px ${c}px`,
                    transformBox: "view-box",
                  } as React.CSSProperties
                }
              />
            </clipPath>
          );
        })}
      </defs>

      {BLOOM_ORDER.map((d, i) => {
        const raw = scores[d.id];
        const path = wedge(size, i * 60);
        return (
          <g key={d.id}>
            {/* Empty track. Always drawn, so the shape of the whole task is visible from question one. */}
            <path d={path} className="bloom-track" />
            {typeof raw === "number" && (
              <path d={path} fill={bandToken(raw)} clipPath={`url(#bloom-clip-${i})`} />
            )}
          </g>
        );
      })}

      <circle cx={c} cy={c} r={ri - size * 0.012} className="bloom-hub" />
      <text x={c} y={c + size * 0.012} textAnchor="middle" className="bloom-value" style={{ fontSize: size * 0.155 }}>
        {typeof composite === "number" ? composite : "—"}
      </text>
      <text x={c} y={c + size * 0.098} textAnchor="middle" className="bloom-count" style={{ fontSize: size * 0.05 }}>
        {done.length}/6
      </text>
    </svg>
  );
}

/**
 * The Bloom's text equivalent. Rendering this next to the Bloom is what keeps colour from being the
 * only carrier of the score — roughly 8% of male participants have a colour vision deficiency.
 */
export function BloomLegend({ scores }: { scores: Partial<Record<PillarId, number>> }) {
  return (
    <ul className="bloom-legend">
      {BLOOM_ORDER.map((d) => {
        const raw = scores[d.id];
        const answered = typeof raw === "number";
        return (
          <li key={d.id} className={`bloom-legend-item ${answered ? "" : "pending"}`}>
            <span
              className="bloom-swatch"
              style={answered ? { background: bandToken(raw as number) } : undefined}
              aria-hidden
            />
            <span className="bloom-legend-name">{d.label}</span>
            <span className="bloom-legend-score">{answered ? `${Math.round(raw as number)}` : "—"}</span>
          </li>
        );
      })}
    </ul>
  );
}
