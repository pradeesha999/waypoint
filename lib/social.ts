// Social connection pillar scoring — implements Social Connection/Social_Connection_Decisions.md.
//
//  Instrument: LSNS-6 (Lubben Social Network Scale, 6 items), used INTACT (Lubben et al., 2006).
//    3 family items + 3 friend items, each 0-5 (number of people in that role). Total 0-30,
//    higher = more social engagement (LESS isolation). Two subscales: family 0-15, friends 0-15.
//  Scoring: linear normalisation, DIRECT (higher network = healthier):
//        score = (total / 30) x 100.   Direction: 100 = most connected = healthiest.
//    Linear (not bands) because LSNS-6 has only ONE validated threshold (<12 = isolated), not graded
//    severity bands; that cut-off is used as an isolation risk FLAG, not to score.
//  Input: self-report only. Reflects current social network.

export const LSNS_MAX = 30;
export const ISOLATION_CUTOFF = 12; // total < 12 = at risk of social isolation (validated cut-off)

export interface LsnsItem {
  id: string;
  eyebrow: string;
  question: string;
  group: "family" | "friends";
}

// LSNS-6 items (Lubben et al., 2006). "Relatives" = family; mirrored for friends.
export const LSNS_ITEMS: LsnsItem[] = [
  { id: "famSeen", eyebrow: "Social · 1 of 6", question: "How many relatives do you see or hear from at least once a month?", group: "family" },
  { id: "famEase", eyebrow: "Social · 2 of 6", question: "How many relatives do you feel at ease with that you can talk to about private matters?", group: "family" },
  { id: "famHelp", eyebrow: "Social · 3 of 6", question: "How many relatives do you feel close to such that you could call on them for help?", group: "family" },
  { id: "friSeen", eyebrow: "Social · 4 of 6", question: "How many of your friends do you see or hear from at least once a month?", group: "friends" },
  { id: "friEase", eyebrow: "Social · 5 of 6", question: "How many friends do you feel at ease with that you can talk to about private matters?", group: "friends" },
  { id: "friHelp", eyebrow: "Social · 6 of 6", question: "How many friends do you feel close to such that you could call on them for help?", group: "friends" },
];

// Shared 0-5 response options (number of people).
export const LSNS_OPTIONS = ["None", "One", "Two", "Three or four", "Five to eight", "Nine or more"];

export interface SocialAnswers {
  // LSNS item responses keyed by id, each 0-5 (null = unanswered).
  lsns: Record<string, number | null>;
}

export const emptySocialAnswers: SocialAnswers = {
  lsns: Object.fromEntries(LSNS_ITEMS.map((it) => [it.id, null])),
};

export interface SocialResult {
  total: number; // 0-30
  familyTotal: number; // 0-15
  friendsTotal: number; // 0-15
  score: number; // 0-100, 100 = most connected = healthiest
  isolated: boolean; // total < 12
  answered: boolean;
}

export function computeSocial(a: SocialAnswers): SocialResult {
  const vals = LSNS_ITEMS.map((it) => a.lsns[it.id]);
  const answered = vals.every((v) => typeof v === "number");

  const sumGroup = (group: "family" | "friends") =>
    LSNS_ITEMS.filter((it) => it.group === group).reduce(
      (s, it) => s + (typeof a.lsns[it.id] === "number" ? (a.lsns[it.id] as number) : 0),
      0
    );

  const familyTotal = sumGroup("family");
  const friendsTotal = sumGroup("friends");
  const total = familyTotal + friendsTotal;
  const score = Math.round(Math.min(100, Math.max(0, (total / LSNS_MAX) * 100)));

  return {
    total,
    familyTotal,
    friendsTotal,
    score,
    isolated: total < ISOLATION_CUTOFF,
    answered,
  };
}
