import type { Metadata } from "next";

// The admin page must never appear in search results.
export const metadata: Metadata = {
  title: "Waypoint admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
