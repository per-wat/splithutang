import { cleanupPerformanceData } from "./seed-performance.ts";

cleanupPerformanceData().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
