import { requireUser } from "@/lib/session"
import { AppHeader } from "@/components/app-header"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader user={{ name: user.name, email: user.email, image: user.image }} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
