import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Trippo — group travel, in sync",
    short_name: "Trippo",
    description: "Plan, coordinate and travel together — even when signal drops.",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d1214",
    theme_color: "#8be000",
    categories: ["travel", "lifestyle", "productivity"],
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "My trips",
        short_name: "Trips",
        url: "/dashboard",
        icons: [{ src: "/icons/192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Notifications",
        short_name: "Inbox",
        url: "/notifications",
        icons: [{ src: "/icons/192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  }
}
