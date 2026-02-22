import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

type DbModule = typeof import("@morphui/db");

let dbModulePromise: Promise<DbModule> | null = null;
let initialized = false;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../db/drizzle");

export async function initTestDb(): Promise<DbModule> {
  if (!dbModulePromise) {
    const tempDir = await mkdtemp(path.join(tmpdir(), "morphui-api-test-"));
    process.env.MORPHUI_DB_PATH = path.join(tempDir, "morphui-test.db");
    dbModulePromise = import("@morphui/db");
  }

  const dbModule = await dbModulePromise;

  if (!initialized) {
    try {
      migrate(dbModule.db, {
        migrationsFolder: MIGRATIONS_FOLDER,
      });
      initialized = true;
    } catch (error) {
      initialized = false;
      dbModulePromise = null;
      throw error;
    }
  }

  return dbModule;
}

export async function resetDb(): Promise<void> {
  const {
    db,
    recommendationCitations,
    experiments,
    recommendations,
    recommendationRuns,
    designSystemChunks,
    designSystemDocuments,
    knowledgeIndexJobs,
    telemetryEvents,
    userPreferences,
    layoutConfigs,
    slotDefinitions,
    users,
  } = await initTestDb();

  db.delete(recommendationCitations).run();
  db.delete(experiments).run();
  db.delete(recommendations).run();
  db.delete(recommendationRuns).run();
  db.delete(designSystemChunks).run();
  db.delete(designSystemDocuments).run();
  db.delete(knowledgeIndexJobs).run();
  db.delete(telemetryEvents).run();
  db.delete(userPreferences).run();
  db.delete(layoutConfigs).run();
  db.delete(slotDefinitions).run();
  db.delete(users).run();
}

export async function seedUserAndSlot(): Promise<{ userId: string; slotKey: string }> {
  const { db, users, slotDefinitions } = await initTestDb();
  const userId = "usr_test_001";
  const slotKey = "hero-banner";

  db.insert(users)
    .values({
      id: userId,
      name: "Test User",
      email: "test-user@example.com",
    })
    .run();

  db.insert(slotDefinitions)
    .values({
      id: "slot_test_001",
      slotKey,
      description: "Test slot",
      variants: JSON.stringify(["minimal", "image-heavy"]),
      defaultVariant: "minimal",
    })
    .run();

  return { userId, slotKey };
}
