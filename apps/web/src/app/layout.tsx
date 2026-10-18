import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { BRAND } from "@prepo/shared";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  // Set APP_URL to the real origin when there is one; see src/lib/site-url.ts for why
  // this is not a hosted domain today.
  metadataBase: new URL(siteUrl()),
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeScript = `(function(){try{var t=localStorage.getItem('prepo-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

/*
 * Chromium can offer installation while the page is still loading, so the offer
 * is caught here - before hydration - and handed to the install button. Without
 * this the button would appear only when the browser fires late, which is to say
 * unpredictably.
 */
const installPromptScript = `(function(){window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__prepoInstallPrompt=e;window.dispatchEvent(new Event('prepo:install-available'));});})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: installPromptScript }} />
      </head>
      <body className="bg-bg font-sans text-text antialiased">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
