import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/contexts/AppContext";


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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Prevent dark mode flash — apply .dark class before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=localStorage.getItem("app-dark");if(d==="true"||(d===null&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()` }} />
      </head>
      <body className="bg-bg-alt text-dark min-h-screen">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
