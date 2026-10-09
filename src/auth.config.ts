import type { NextAuthConfig } from "next-auth"
import Google from "next-auth/providers/google"

/**
 * Edge-safe Auth.js configuration.
 * No database adapter here so it can run in middleware (edge runtime).
 * The Prisma adapter is attached in `auth.ts` (Node runtime).
 */
export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const protectedPaths = ["/dashboard", "/trips", "/print", "/settings", "/notifications"]
      const isProtected = protectedPaths.some((p) =>
        nextUrl.pathname.startsWith(p)
      )
      if (isProtected) return isLoggedIn
      return true
    },
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig
