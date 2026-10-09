"use client"

import * as React from "react"
import { ChromaFlow, FlutedGlass, Shader, Swirl } from "shaders/react"

/**
 * The glass backdrop behind the whole app: a slow swirl of Trippo's lime,
 * colour flowing through it, all seen through fluted glass. Surfaces that are
 * translucent (cards, the sidebar, sticky bars) blur this, which is what makes
 * them read as glass.
 *
 * A soft wash sits on top so text stays readable, the animation stops for
 * people who prefer reduced motion, and if the browser can't run WebGPU the
 * plain gradient underneath simply shows instead.
 */

const PALETTES = {
  light: {
    swirl: ["#d4f56b", "#a6e91c"],
    base: "#c9f25a",
    up: "#b6ee3d",
    down: "#a3e61f",
    left: "#c2f04a",
    right: "#8fdc00",
    intensity: 1.2,
    highlight: "#ffffff",
    // Lets the page's own background through, so dark text stays easy to read.
    wash: "bg-background/55",
  },
  dark: {
    swirl: ["#07100a", "#1a3a00"],
    base: "#08120a",
    up: "#143000",
    down: "#0d2200",
    left: "#1a3d00",
    right: "#245200",
    intensity: 0.8,
    highlight: "#2a5c00",
    wash: "bg-background/62",
  },
} as const

const subscribeNothing = () => () => {}

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)")
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

// The `dark` class on <html> is what every dark: style in the app keys off.
function subscribeDarkClass(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

export function ShaderBackground() {
  const dark = React.useSyncExternalStore(
    subscribeDarkClass,
    () => document.documentElement.classList.contains("dark"),
    () => false
  )
  // Wait for the client so the first paint matches the server (no theme yet).
  const mounted = React.useSyncExternalStore(subscribeNothing, () => true, () => false)
  const reduceMotion = React.useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  )
  const [unavailable, setUnavailable] = React.useState(false)

  const palette = PALETTES[dark ? "dark" : "light"]

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 print:hidden">
      {/* The fallback, and what shows for a moment while the shader starts. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(135deg, ${palette.swirl[0]}, ${palette.swirl[1]})`,
        }}
      />

      {mounted && !unavailable && (
        <Shader
          toneMapping="neutral"
          disableTelemetry
          className="absolute inset-0 size-full"
          onUnavailable={() => setUnavailable(true)}
        >
          <Swirl
            blend={50}
            detail={1.7}
            speed={reduceMotion ? 0 : undefined}
            stops={[
              { color: palette.swirl[0], position: 0 },
              { color: palette.swirl[1], position: 1 },
            ]}
          />
          <ChromaFlow
            baseColor={palette.base}
            blendMode="hardLight"
            downColor={palette.down}
            intensity={palette.intensity}
            leftColor={palette.left}
            momentum={reduceMotion ? 0 : 10}
            rightColor={palette.right}
            upColor={palette.up}
          />
          <FlutedGlass
            aberration={0}
            angle={107}
            frequency={13}
            highlightColor={palette.highlight}
            refraction={2.46}
            shape="rounded"
            softness={1}
            speed={reduceMotion ? 0 : 0.15}
          />
        </Shader>
      )}

      <div className={`absolute inset-0 ${palette.wash}`} />
    </div>
  )
}
