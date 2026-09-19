"use server"

import { signIn, signOut } from "@/auth"

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/dashboard" })
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}

// Local development only — see the "dev" provider in auth.ts.
export async function devSignIn(formData: FormData) {
  if (process.env.NODE_ENV === "production") return
  const email = String(formData.get("email") ?? "").trim()
  if (!email) return
  await signIn("dev", { email, redirectTo: "/dashboard" })
}
