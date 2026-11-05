import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Word Hug — Sometimes you just need a Word Hug.", template: "%s · Word Hug" },
  description:
    "Personal compliments, pep talks, loving roasts and gloriously cheesy pickup lines. Written for you, or for someone who needs one. Want it out loud? A real human will record it.",
  robots: { index: false, follow: false }, // prototype: keep out of search
  appleWebApp: { capable: true, title: "Word Hug", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#f6efe6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
