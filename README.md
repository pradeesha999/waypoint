# Waypoint

A mobile-first web app that gives adults one 0-100 lifestyle health score from six areas of
lifestyle: physical activity, sleep, nutrition, stress, social connection, and tobacco and alcohol use.

- Each area is measured with a validated questionnaire used in full (IPAQ-SF, ISI, rPDQS, PSS-10,
  LSNS-6, AUDIT-C with a smoking item) and converted to a 0-100 domain score (100 = healthiest).
- The six domain scores are combined with weights derived from published evidence on all-cause
  mortality (`lib/composite.ts`).
- Questions are shown one at a time and answered by tapping, with skips only where a
  questionnaire's own rules allow them, and a score after each area.
- Signed-in users keep a history of check-ins; a change is reported only when two check-ins are at
  least 28 days apart and differ by 10 points or more (`lib/history.ts`).

Live app: https://waypoint-jet-alpha.vercel.app

## Structure

| Path | Contents |
|---|---|
| `lib/` | Scoring for each questionnaire, the composite and weights, history rules, telemetry, database access |
| `components/` | Question screens, the unified assessment flow, study flow and the comparison web form |
| `app/` | Pages: the app, the doctor rating page (`/doctor`), the researcher dashboard (`/admin`) and API routes |

## Run it

```bash
npm install
npm run dev
```

Needs a Supabase project; set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in
`.env.local` (server routes also use `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD` and `DOCTOR_PASSWORD`).

See `DEVELOPMENT_HISTORY.md` for the dated development timeline.
