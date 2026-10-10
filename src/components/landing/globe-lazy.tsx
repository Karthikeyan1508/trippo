"use client"

import dynamic from "next/dynamic"

/** three.js is large and only the landing page needs it, so it loads after the page is up. */
export const HeroGlobe = dynamic(() => import("./hero-globe").then((m) => m.HeroGlobe), {
  ssr: false,
  loading: () => null,
})
