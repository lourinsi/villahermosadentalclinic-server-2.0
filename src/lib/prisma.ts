import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const getRuntimeConnectionString = (url: string) => {
  const shouldSkipCertVerification =
    url.includes(".supabase.com") ||
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false";

  if (!shouldSkipCertVerification) {
    return url;
  }

  const runtimeUrl = new URL(url);
  runtimeUrl.searchParams.set("sslmode", "no-verify");
  runtimeUrl.searchParams.delete("pgbouncer");
  return runtimeUrl.toString();
};

const adapter = new PrismaPg(getRuntimeConnectionString(connectionString));

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
