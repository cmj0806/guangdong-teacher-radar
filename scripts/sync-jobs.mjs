import { fileURLToPath } from "node:url";
import { syncJobs } from "../lib/sync.mjs";
const rootDir = fileURLToPath(new URL("..", import.meta.url));
try { const result = await syncJobs(rootDir); console.log(result.message); }
catch (error) { console.error(`更新失败：${error.message}`); process.exitCode = 1; }
