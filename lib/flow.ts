// Shared flow timings for the assessment.
//
//  See Docs/Assessment_Flow_Spec.md §6. Kept in one place so the whole assessment feels consistent
//  and the timings can be tuned once.
//
//  ADVANCE_MS is deliberately short: twelve one-second pauses would be twelve seconds of watching
//  animations inside an app whose entire claim is lower respondent burden. Anything past roughly
//  300 ms between questions reads as lag rather than polish.

export const ADVANCE_MS = 280; // pause after tapping an answer before moving to the next question
// Retired: the chapter screen no longer auto-advances. It carries information the participant is
// meant to read, and self-paced reading is the accessible behaviour (WCAG "Pause, Stop, Hide").
// export const CHAPTER_MS = 1500;
export const COUNTUP_MS = 800; // final score count-up

// Respect the OS "reduce motion" setting — replace movement with instant transitions.
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Delay used for auto-advance, collapsed to near-zero when reduced motion is requested.
export function advanceDelay(): number {
  return prefersReducedMotion() ? 0 : ADVANCE_MS;
}
