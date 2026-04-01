import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const publicSans = Public_Sans({subsets:['latin'],variable:'--font-sans'});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"]
});

export const metadata: Metadata = {
  title: "Symphony Control Plane",
  description:
    "Realtime operator shell for Symphony runtime observability, runs, and forensics."
};

export default function RootLayout(input: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", ibmPlexMono.variable, "font-sans", publicSans.variable)}
    >
      <body>
        <ThemeProvider>{input.children}</ThemeProvider>
      </body>
    </html>
  );
}
