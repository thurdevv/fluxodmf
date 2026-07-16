export const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/fluxo?schema=public";

export function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}
