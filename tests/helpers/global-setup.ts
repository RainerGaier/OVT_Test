import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
