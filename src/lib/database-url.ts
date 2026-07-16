export const DEFAULT_DATABASE_URL = "file:./prisma/dev.db";

export function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}
