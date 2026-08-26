import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import InstallPrompt from "@/components/InstallPrompt";
import "./globals.css";
import { AppProvider } from "@/contexts/AppContext";
import AnalyticsSafe from "@/components/AnalyticsSafe";


export const metadata: Metadata = {
  title: "Breakfast Check-in",
  description: "Hotel restaurant breakfast check-in system",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#A66914",
  /* Installed on an iPad there is no browser chrome, and the home indicator
     sits over the last ~20px of the screen. Without this the OS shrinks the
     viewport and 100dvh lies about how much of it is usable; with it we get
     the whole screen and take responsibility for the insets — which the docks
     do, via env(safe-area-inset-bottom). */
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Minted per request by the middleware, which also puts it in the CSP.
  // Without it Next's own hydration scripts are blocked and every page renders
  // blank — the loose policy was hiding that.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg-alt text-dark min-h-screen">
        {/* Prevent dark mode flash — runs before first paint.
            Served from /theme-init.js rather than written inline: an inline
            script needs `script-src 'unsafe-inline'`, and with guest names now
            encrypted in browser storage, script injection is the residual path
            to them. One inline script was holding the CSP open for the whole
            app. */}
        <Script id="theme-init" src="/theme-init.js" strategy="beforeInteractive" nonce={nonce} />
        <AppProvider>
          {children}
          <InstallPrompt />
        </AppProvider>
        <AnalyticsSafe />
      </body>
    </html>
  );
}
