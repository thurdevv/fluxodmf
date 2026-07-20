export function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL nao configurada. Informe a URL do PostgreSQL.");
  }

  return databaseUrl;
}
