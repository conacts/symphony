import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";
import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import { loadSymphonyDashboardEnv } from "@/core/env";
import { ThemeProvider } from "@/components/theme-provider";
import { ControlPlaneFrame } from "@/features/shared/components/control-plane-frame";
import { ControlPlaneModelProvider } from "@/features/shared/components/control-plane-model-context";
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
  const model = buildSymphonyDashboardFoundation(loadSymphonyDashboardEnv());

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", ibmPlexMono.variable, "font-sans", publicSans.variable)}
    >
      <body>
        <ThemeProvider>
          <ControlPlaneModelProvider model={model}>
            <ControlPlaneFrame>{input.children}</ControlPlaneFrame>
          </ControlPlaneModelProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
