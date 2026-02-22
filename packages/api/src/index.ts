import app from "./app.js";
import { startWorker } from "./worker/scheduler.js";

const portValue = Number(process.env.PORT || 3456);
if (Number.isNaN(portValue) || portValue <= 0) {
  throw new Error("PORT must be a positive number.");
}
const PORT = portValue;

const server = app.listen(PORT, () => {
  console.log(`MorphUI API running on http://localhost:${PORT}`);
  const stopWorker = startWorker();

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    stopWorker();
    server.close((error) => {
      if (error) {
        console.error("Failed to close server cleanly", error);
        process.exit(1);
      }
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
});
