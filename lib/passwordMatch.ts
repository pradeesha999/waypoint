// Server-only password check for the researcher and doctor routes.
//
//  Both sides are hashed first so the comparison takes the same time whatever the input length.

import { createHash, timingSafeEqual } from "crypto";

export function passwordMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
