import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

migrate(db, { migrationsFolder: join(__dirname, "..", "drizzle") });
console.log("Migrations applied successfully.");
