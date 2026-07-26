import { beforeEach } from "vitest";
import { truncateAll } from "./db";

beforeEach(async () => {
  await truncateAll();
});
