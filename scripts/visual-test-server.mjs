import "dotenv/config";
import { execFileSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const databaseName = "fluxo_codex_visual_test_20260720";
const sourceUrl = new URL(process.env.DATABASE_URL);
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";
const testUrl = new URL(sourceUrl);
testUrl.pathname = `/${databaseName}`;

async function cleanup() {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [databaseName],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
  console.log("Ambiente visual temporário removido.");
}

if (process.argv[2] === "cleanup") {
  await cleanup();
} else {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (exists.rowCount) throw new Error("O banco visual temporário já existe; execute cleanup.");
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await admin.end();

  process.env.DATABASE_URL = testUrl.toString();
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "inherit" });
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], { env: process.env, stdio: "inherit" });
  process.argv = [process.execPath, "next", "start", "-p", "3208"];
  await import("../node_modules/next/dist/bin/next");
}
