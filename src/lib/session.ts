import { redirect } from "next/navigation"
import { auth } from "@/auth"

export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}
