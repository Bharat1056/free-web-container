import type { Metadata } from "next";
import {
  DM_Sans,
  Geist_Mono,
  Patrick_Hand,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";
import { TRPCReactProvider } from "@/trpc/client";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { ErrorBoundary } from "@/components/error-boundary";
import { GeminiKeyGateProvider } from "@/modules/user-settings/ui/gemini-key-gate";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const patrickHand = Patrick_Hand({
  variable: "--font-patrick-hand",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Vibe",
  description: "AI-Powered Web Development Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TRPCReactProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${dmSans.variable} ${spaceGrotesk.variable} ${geistMono.variable} ${patrickHand.variable} font-sans antialiased`}
        >
          <ErrorBoundary>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
              themes={["light", "dark"]}
            >
              <GeminiKeyGateProvider>
                {children}
                <Toaster />
              </GeminiKeyGateProvider>
            </ThemeProvider>
          </ErrorBoundary>
        </body>
      </html>
    </TRPCReactProvider>
  );
}
