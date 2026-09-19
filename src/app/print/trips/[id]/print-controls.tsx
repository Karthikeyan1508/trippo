"use client"

import * as React from "react"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PrintControls() {
  React.useEffect(() => {
    const t = setTimeout(() => window.print(), 700)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="mb-6 flex justify-end gap-2 print:hidden">
      <Button onClick={() => window.print()} className="gap-2">
        <Printer className="size-4" />
        Print / Save as PDF
      </Button>
    </div>
  )
}
