// Monthly check-in reminder, delivered as a calendar file the user adds to their own calendar.
//
//  No email address is collected and nothing runs on a server: the reminder lives in the user's
//  calendar, so it keeps working even if they never come back to sign in. The interval matches the
//  history rule (MIN_COMPARISON_DAYS), so the reminder never invites a comparison that is too soon.

import { MIN_COMPARISON_DAYS } from "@/lib/history";

export function nextCheckInDate(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + MIN_COMPARISON_DAYS);
  return d;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

// An all-day event on the check-in date with an alert at 9 am that morning.
export function checkInIcs(date: Date, url: string): string {
  const end = new Date(date);
  end.setDate(end.getDate() + 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Waypoint//Monthly check-in//EN",
    "BEGIN:VEVENT",
    `UID:waypoint-${ymd(date)}-${Math.random().toString(36).slice(2)}@waypoint`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(date)}`,
    `DTEND;VALUE=DATE:${ymd(end)}`,
    "SUMMARY:Waypoint monthly check-in",
    `DESCRIPTION:Time for your monthly Waypoint check-in. It takes about 8 minutes: ${url}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Waypoint monthly check-in",
    "TRIGGER:PT9H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadCheckIn(date: Date, url: string) {
  const blob = new Blob([checkInIcs(date, url)], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "waypoint-check-in.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
