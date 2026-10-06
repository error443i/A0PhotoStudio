import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AO Photography | Honest Photography for the In-Between",
  description:
    "Thoughtful wedding, portrait, and family photography for the days you never want to forget. Based in Portland, Oregon.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
