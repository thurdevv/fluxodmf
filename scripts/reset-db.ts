import "dotenv/config";
import { rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const dbPath = databaseUrl.replace(/^file:/, "");
const absolutePath = path.resolve(process.cwd(), dbPath);

for (const suffix of ["", "-journal", "-shm", "-wal"]) {
  rmSync(`${absolutePath}${suffix}`, { force: true });
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

run(npxCommand, ["tsx", "scripts/init-db.ts"]);
run(npxCommand, ["tsx", "prisma/seed.ts"]);
