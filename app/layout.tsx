import type { Metadata, Viewport } from "next";
import { Newsreader, Public_Sans } from "next/font/google";
import "./globals.css";

// Both faces are SELF-HOSTED. next/font downloads them at build time and serves them from our own
// origin, so a participant on a slow 3G connection in a clinic waiting room never waits on a
// third-party DNS lookup + TLS handshake to Google before any text is readable. The previous
// stylesheet used an @import to fonts.googleapis.com, which is render-blocking and off-origin.
//
// Newsreader (serif) carries the numbers and headings — warm, and serious without reading
// governmental. Public Sans is a public-service typeface designed for exactly this brief: mixed
// literacy, small screens, high legibility at small sizes. Deliberately not Inter.
const display = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-display",
  fallback: ["Georgia", "Times New Roman", "serif"],
  // next/font has no metric table for Newsreader, so it cannot generate a size-adjusted fallback
  // and warns on every build. Declared off deliberately: the serif is used only for headings and
  // score numerals — short, and either centred or on their own line — so the swap costs a reflow of
  // a couple of lines, not of the page. Body text keeps the automatic adjustment.
  adjustFontFallback: false,
});

const body = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-body",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Waypoint — your whole health, one number",
  description:
    "Waypoint turns everyday health — activity, sleep, nutrition, social connection, stress, alcohol and tobacco — into one 0–100 score you can check in on and track over time.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale and no userScalable:false. Pinch-zoom stays available — a participant with low
  // vision must be able to enlarge a question, and this study cannot screen them out.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#131c1a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <a className="skiplink" href="#main">
          Skip to the questions
        </a>
        {children}
      </body>
    </html>
  );
}
