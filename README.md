# Health Score — Project (Physical Activity prototype)

A mobile-first Next.js website to test the **Physical Activity** pillar of the composite
health score. Delivers the IPAQ-SF questionnaire one question at a time (friction-optimised)
and computes a 0–100 score using the decisions in
`../Physical Activity/Physical_Activity_Decisions.md`.

## Run it

```bash
cd Project
npm install
npm run dev
```

Then open http://localhost:3000 on your computer or phone (same Wi-Fi: use your computer's
local IP, e.g. http://192.168.x.x:3000).

## What it implements

- **Instrument:** IPAQ-SF (vigorous, moderate, walking days + minutes; sitting).
- **Adaptive branching:** the "minutes" question only appears if you did that activity.
- **Scoring:** MET-min/week = 3.3×walk + 4.0×moderate + 8.0×vigorous (× minutes × days),
  with single-day durations capped at 180 min (official IPAQ cleaning).
- **0–100 map (evidence-based / mortality-risk currency):** the score is the share of the
  maximum all-cause mortality risk reduction activity can give. Anchored to 2022+ dose-response
  evidence (~30% lower mortality at the ~600 MET-min guideline → ~75; ~40% max at ~2400 MET-min
  → 100, then flat). `score = (1 − RR) / (1 − 0.6) × 100`, clamped [0,100].
- **Sitting:** a small conditional penalty (−5) only when below the guideline AND sitting
  ≥8 h/day (activity offsets sitting risk); final score clamped to [0,100].

## Where the logic lives

- `lib/ipaq.ts` — pure scoring functions (easy to unit-test / reuse).
- `components/PhysicalActivityQuestionnaire.tsx` — the one-question-at-a-time UI.
- `app/` — Next.js App Router shell + styles.

## Pillars implemented so far

- **Physical activity** (`lib/ipaq.ts`) — IPAQ-SF → mortality-risk-based 0–100 + conditional sitting penalty.
- **Restorative sleep** (`lib/sleep.ts`) — ISI (band-based) + asymmetric duration risk curve, 50/50.
- **Nutrition** (`lib/nutrition.ts`) — MEDAS-14 (intact) → linear 0–100 + wine sensitivity score.

Each outputs 0–100 where 100 = healthiest, on the common scale that will feed the weighted composite.

## Note

This is a prototype for testing the scoring, not the final study platform. The control
(single-page) form, the weighted composite, and the remaining three pillars (stress, social
connection, risky substances) are not included yet.
