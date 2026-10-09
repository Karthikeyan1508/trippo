import type { Metadata, Viewport } from "next"
import { Geist_Mono, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { Providers } from "@/components/providers"
import { ShaderBackground } from "@/components/shader-background"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

// The shadcn preset's typeface. Exposed as `--font-sans`, which Tailwind's
// `font-sans` (and `--font-heading`) resolve to in globals.css.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans" })

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

// Absolute base for share-preview image URLs (Open Graph needs full URLs).
const siteUrl = process.env.AUTH_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Trippo",
  openGraph: { siteName: "Trippo", type: "website" },
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [{ url: "/icons/192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "Trippo", statusBarStyle: "black-translucent" },
  title: "Trippo — Plan group trips together",
  description:
    "The single source of truth for your group trip: preferences, AI itineraries, live location, and shared budgets in one place.",
}

// Keeps the browser chrome (address bar on phones, installed PWA) in step with the theme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1214" },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes sets the `class` before hydration.
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full antialiased font-sans", spaceGrotesk.variable, geistMono.variable)}
    >
      <body className="min-h-full flex flex-col">
        <ShaderBackground />
        <Providers>{children}</Providers>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  )
}
