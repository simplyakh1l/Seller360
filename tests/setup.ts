import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
// Each isolated test file gets disposable storage, never the running demo's tasks.
const directory = mkdtempSync(join(tmpdir(), "seller360-tests-"));
process.env.SELLER360_DATA_DIR = directory;
afterAll(() => rmSync(directory, { recursive: true, force: true }));
