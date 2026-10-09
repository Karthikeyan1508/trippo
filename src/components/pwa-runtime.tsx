"use client"

import * as React from "react"

export function PwaRuntime() {
  React.useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {})
    }
  }, [])
  return null
}
