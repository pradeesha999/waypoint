import type { Metadata } from "next";

// The doctor page must never appear in search results.
export const metadata: Metadata = {
  title: "Waypoint doctor",
  robots: { index: false, follow: false },
};

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
