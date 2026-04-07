import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";
import { buildSymphonyDashboardFoundation } from "@/core/dashboard-foundation";
import {
  isSymphonyDashboardDevelopmentEnvironment,
  loadSymphonyDashboardEnv
} from "@/core/env";
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
  const isDevelopment = isSymphonyDashboardDevelopmentEnvironment();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", ibmPlexMono.variable, "font-sans", publicSans.variable)}
    >
      <head>
        {isDevelopment && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body>
        <ThemeProvider>
          <ControlPlaneModelProvider model={model}>
            <Suspense fallback={null}>
              <ControlPlaneFrame>{input.children}</ControlPlaneFrame>
            </Suspense>
          </ControlPlaneModelProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
