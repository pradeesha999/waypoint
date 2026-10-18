# Development history

Waypoint was developed locally and deployed to Vercel directly from the command line (Vercel CLI) from
August 2026. Version control with Git was added on 20 October 2026, so this repository starts with a single
commit of the current code. The timeline below is taken from the project's dated design-decision log and the
Vercel deployment history, which records every production deployment with its date.

| Date | Milestone |
|---|---|
| Jul-Aug 2026 | Design science approach chosen; six lifestyle domains and their validated questionnaires selected (IPAQ-SF, ISI, rPDQS, PSS-10, LSNS-6, AUDIT-C with a smoking item) |
| Aug 2026 | Scoring built one domain at a time: each questionnaire normalised to a 0-100 domain score; equal-weight composite as a placeholder |
| 11 Aug 2026 | Weighting rule fixed (weight proportional to relative risk minus 1); one unified assessment flow with a chapter per domain; true progress indicator |
| 20 Sep 2026 | Pause and resume for the product version |
| 28 Sep 2026 | Consent screen and anonymous start record, so completion can be measured |
| 2 Oct 2026 | Relative risks pinned to published sources; evidence-based weights in the composite |
| 5 Oct 2026 | Doctor-issued patient codes and the doctor rating page |
| 8 Oct 2026 | Study released: random allocation to Waypoint or the conventional web form |
| 10 Oct 2026 | Web form follows each questionnaire's skip rules; device id for 7-day retest pairing; score screen continue bar |
| 11 Oct 2026 | Doctor's domain ratings on a 0-10 scale; single-use clinic codes |
| 14 Oct 2026 | Researcher dashboard with live analysis; one shared definition of careless answering |
| 20 Oct 2026 | Smallest reported change between check-ins set to 10 points from the test-retest result |

Earlier deployments can be inspected in the Vercel project (`waypoint`), which keeps each deployment and its
date.
