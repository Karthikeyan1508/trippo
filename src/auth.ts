import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"

import { prisma } from "@/lib/prisma"
import { authConfig } from "@/auth.config"

// Local-only sign-in: lets you into the app without Google OAuth while
// developing. Never registered in production.
const devProviders =
  process.env.NODE_ENV !== "production"
    ? [
        Credentials({
          id: "dev",
          name: "Dev login",
          credentials: { email: { label: "Email", type: "email" } },
          authorize: async (creds) => {
            const email =
              typeof creds?.email === "string"
                ? creds.email.trim().toLowerCase()
                : ""
            if (!email) return null
            const user =
              (await prisma.user.findUnique({ where: { email } })) ??
              (await prisma.user.create({
                data: { email, name: email.split("@")[0] },
              }))
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
            }
          },
        }),
      ]
    : []

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [...authConfig.providers, ...devProviders],
  adapter: PrismaAdapter(prisma),
})
