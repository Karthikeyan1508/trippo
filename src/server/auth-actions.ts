"use server"

import { signIn, signOut } from "@/auth"
import { safeRedirectPath } from "@/lib/redirect"

/** Sign in with Google, then return to where the user was headed (e.g. an invite link). */
export async function signInWithGoogle(formData: FormData) {
  const redirectTo = safeRedirectPath(formData.get("callbackUrl"))
  await signIn("google", { redirectTo })
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}

// Local development only — see the "dev" provider in auth.ts.
export async function devSignIn(formData: FormData) {
  if (process.env.NODE_ENV === "production") return
  const email = String(formData.get("email") ?? "").trim()
  if (!email) return
  const redirectTo = safeRedirectPath(formData.get("callbackUrl"))
  await signIn("dev", { email, redirectTo })
}
