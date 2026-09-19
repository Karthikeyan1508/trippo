import { defineConfig } from "prisma/config"

// Prisma 7 does not auto-load .env when a config file is present.
try {
  process.loadEnvFile()
} catch {
  // No .env file — rely on the ambient environment instead.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Used by the CLI (migrate / db push / studio) — the direct, non-pooled URL.
  datasource: {
    url: process.env.DIRECT_URL,
  },
})
