import NextAuth from "next-auth"
import { authConfig } from "@/auth.config"

// Edge-safe auth (no Prisma adapter) — runs on every matched request to
// gate protected routes via the `authorized` callback in auth.config.ts.
const { auth } = NextAuth(authConfig)

export default auth

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
