import { runAnalysis } from "./analyzer.js";

const INTERVAL_MS = 10_000; // 10 seconds for demo
let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startWorker(): () => void {
  if (workerInterval) {
    return stopWorker;
  }

  console.log(`Worker started. Analyzing every ${INTERVAL_MS / 1000}s`);

  const tick = () => {
    try {
      const result = runAnalysis();
      if (result.processedCount > 0) {
        console.log(
          `Worker: processed ${result.processedCount} events, ` +
            `updated ${result.updatedPreferences} preferences`,
        );
      }
    } catch (err) {
      console.error("Worker error:", err);
    }
  };

  tick();
  workerInterval = setInterval(tick, INTERVAL_MS);
  return stopWorker;
}

function stopWorker() {
  if (!workerInterval) return;
  clearInterval(workerInterval);
  workerInterval = null;
  console.log("Worker stopped.");
}
