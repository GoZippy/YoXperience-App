import {
  db,
  designSystemChunks,
  designSystemDocuments,
  knowledgeIndexJobs,
} from "@morphui/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import { promises as fs } from "fs";
import path from "path";
import { ValidationError } from "../utils/errors.js";

interface ReindexRequest {
  projectId: string;
  source: string;
  paths: string[];
  versionTag?: string | null;
}

interface ReindexResult {
  jobId: string;
  status: "completed" | "failed";
  documentsIndexed: number;
  chunksIndexed: number;
  failedDocuments: number;
}

interface ChunkSearchOptions {
  componentId?: string;
  limit?: number;
}

export interface KnowledgeChunkResult {
  chunkId: string;
  text: string;
  sourcePath: string;
  sourceType: string;
  componentId: string | null;
  score: number;
}

const SUPPORTED_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".json",
  ".txt",
]);
const DEFAULT_VERSION_TAG = "unversioned";
const DEFAULT_ALLOWED_ROOTS = [process.cwd()];

export async function reindexKnowledge(
  request: ReindexRequest,
): Promise<ReindexResult> {
  const versionTag = request.versionTag?.trim() || DEFAULT_VERSION_TAG;
  const jobId = `kjob_${nanoid(12)}`;
  const startedAt = new Date().toISOString();

  db.insert(knowledgeIndexJobs)
    .values({
      id: jobId,
      projectId: request.projectId,
      source: request.source,
      paths: JSON.stringify(request.paths),
      versionTag,
      status: "running",
      startedAt,
    })
    .run();

  try {
    const files = await resolveInputFiles(request.paths);
    let documentsIndexed = 0;
    let chunksIndexed = 0;
    let failedDocuments = 0;

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, "utf8");
        if (!content.trim()) continue;
        const checksum = sha256(content);
        const sourcePath = path.resolve(filePath);
        const docId = toStableId("doc", `${sourcePath}::${versionTag}`);
        const componentId = inferComponentId(sourcePath);
        const metadata = {
          extension: path.extname(sourcePath),
          fileName: path.basename(sourcePath),
        };

        db.transaction((tx) => {
          tx.insert(designSystemDocuments)
            .values({
              id: docId,
              projectId: request.projectId,
              sourceType: request.source,
              sourcePath,
              componentId,
              versionTag,
              checksum,
              content,
              metadata: JSON.stringify(metadata),
              updatedAt: new Date().toISOString(),
            })
            .onConflictDoUpdate({
              target: [
                designSystemDocuments.sourcePath,
                designSystemDocuments.versionTag,
                designSystemDocuments.projectId,
              ],
              set: {
                id: docId,
                checksum,
                content,
                componentId,
                metadata: JSON.stringify(metadata),
                updatedAt: new Date().toISOString(),
              },
            })
            .run();

          tx.delete(designSystemChunks)
            .where(eq(designSystemChunks.documentId, docId))
            .run();

          const chunks = chunkDocument(content);
          if (chunks.length > 0) {
            tx.insert(designSystemChunks)
              .values(
                chunks.map((chunk, idx) => ({
                  id: `chunk_${nanoid(12)}`,
                  documentId: docId,
                  chunkOrder: idx,
                  chunkText: chunk,
                  metadata: JSON.stringify({
                    sourcePath,
                    componentId,
                    chunkLength: chunk.length,
                  }),
                })),
              )
              .run();
          }
          documentsIndexed += 1;
          chunksIndexed += chunks.length;
        });
      } catch (error) {
        failedDocuments += 1;
        console.error(`Knowledge indexing failed for ${filePath}`, error);
      }
    }

    db.update(knowledgeIndexJobs)
      .set({
        status: "completed",
        documentsIndexed,
        chunksIndexed,
        failedDocuments,
        finishedAt: new Date().toISOString(),
      })
      .where(eq(knowledgeIndexJobs.id, jobId))
      .run();

    return {
      jobId,
      status: "completed",
      documentsIndexed,
      chunksIndexed,
      failedDocuments,
    };
  } catch (error) {
    db.update(knowledgeIndexJobs)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      })
      .where(eq(knowledgeIndexJobs.id, jobId))
      .run();

    if (error instanceof ValidationError) {
      throw error;
    }

    return {
      jobId,
      status: "failed",
      documentsIndexed: 0,
      chunksIndexed: 0,
      failedDocuments: 0,
    };
  }
}

export function getKnowledgeJob(jobId: string) {
  return db
    .select()
    .from(knowledgeIndexJobs)
    .where(eq(knowledgeIndexJobs.id, jobId))
    .get();
}

export function getKnowledgeComponent(componentId: string) {
  const docs = db
    .select({
      id: designSystemDocuments.id,
      sourcePath: designSystemDocuments.sourcePath,
      versionTag: designSystemDocuments.versionTag,
      sourceType: designSystemDocuments.sourceType,
      componentId: designSystemDocuments.componentId,
    })
    .from(designSystemDocuments)
    .where(eq(designSystemDocuments.componentId, componentId))
    .orderBy(desc(designSystemDocuments.updatedAt))
    .all();

  if (docs.length === 0) {
    return null;
  }

  const chunks = db
    .select({
      chunkId: designSystemChunks.id,
      text: designSystemChunks.chunkText,
      documentId: designSystemChunks.documentId,
    })
    .from(designSystemChunks)
    .where(
      inArray(
        designSystemChunks.documentId,
        docs.map((doc) => doc.id),
      ),
    )
    .orderBy(designSystemChunks.chunkOrder)
    .limit(25)
    .all();

  return {
    componentId,
    versionTag: docs[0]!.versionTag,
    stories: docs.map((doc) => path.basename(doc.sourcePath)),
    topChunks: chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      text: chunk.text.slice(0, 400),
      sourcePath:
        docs.find((doc) => doc.id === chunk.documentId)?.sourcePath ?? "unknown",
    })),
  };
}

export function searchKnowledgeChunks(
  query: string,
  options: ChunkSearchOptions = {},
): KnowledgeChunkResult[] {
  const limit = options.limit ?? 6;
  const searchTerms = tokenize(query);
  if (searchTerms.length === 0) return [];

  const chunkRows = db
    .select({
      chunkId: designSystemChunks.id,
      text: designSystemChunks.chunkText,
      sourcePath: designSystemDocuments.sourcePath,
      sourceType: designSystemDocuments.sourceType,
      componentId: designSystemDocuments.componentId,
    })
    .from(designSystemChunks)
    .innerJoin(
      designSystemDocuments,
      eq(designSystemChunks.documentId, designSystemDocuments.id),
    )
    .where(
      options.componentId
        ? eq(designSystemDocuments.componentId, options.componentId)
        : undefined,
    )
    .limit(1500)
    .all();

  const scored = chunkRows
    .map((row) => ({
      ...row,
      score: scoreText(row.text, searchTerms),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((row) => ({
    chunkId: row.chunkId,
    text: row.text,
    sourcePath: row.sourcePath,
    sourceType: row.sourceType,
    componentId: row.componentId,
    score: row.score,
  }));
}

export function getKnownComponentIds(limit = 200): string[] {
  const rows = db
    .select({
      componentId: designSystemDocuments.componentId,
    })
    .from(designSystemDocuments)
    .where(sql`${designSystemDocuments.componentId} is not null`)
    .groupBy(designSystemDocuments.componentId)
    .limit(limit)
    .all();
  return rows
    .map((row) => row.componentId)
    .filter((value): value is string => Boolean(value));
}

async function resolveInputFiles(inputs: string[]): Promise<string[]> {
  const allowedRoots = await resolveAllowedRoots();
  const files = new Set<string>();
  for (const input of inputs) {
    const trimmed = input.trim();
    if (!trimmed) continue;
    const hasGlob = isGlobPattern(trimmed);
    if (hasGlob && !isKnowledgeGlobbingEnabled()) {
      throw new ValidationError(
        `Glob patterns are disabled for knowledge indexing: "${trimmed}".`,
      );
    }

    if (hasGlob) {
      const globMatches = await resolveGlob(trimmed, allowedRoots);
      for (const file of globMatches) files.add(file);
      continue;
    }

    const resolved = path.resolve(trimmed);
    if (!(await isPathAllowed(resolved, allowedRoots))) {
      throw new ValidationError(
        `Path is outside MORPHUI_KNOWLEDGE_ALLOWED_ROOTS: "${trimmed}".`,
      );
    }

    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat) {
      throw new ValidationError(`Path does not exist: "${trimmed}".`);
    }
    if (stat.isDirectory()) {
      const directoryFiles = await walkDir(resolved, allowedRoots);
      for (const file of directoryFiles) files.add(file);
    } else if (stat.isFile() && isSupportedFile(resolved)) {
      files.add(resolved);
    }
  }

  if (files.size === 0) {
    throw new ValidationError(
      "No supported files were found in the provided knowledge indexing paths.",
    );
  }

  return [...files];
}

async function resolveGlob(pattern: string, allowedRoots: string[]): Promise<string[]> {
  const absolute = path.resolve(pattern);
  if (!(await isPathAllowed(absolute, allowedRoots))) {
    throw new ValidationError(
      `Glob pattern is outside MORPHUI_KNOWLEDGE_ALLOWED_ROOTS: "${pattern}".`,
    );
  }

  const firstWildcard = absolute.search(/[\*\?]/);
  const base =
    firstWildcard >= 0
      ? absolute.slice(0, absolute.lastIndexOf(path.sep, firstWildcard))
      : absolute;
  if (!(await isPathAllowed(base || process.cwd(), allowedRoots))) {
    throw new ValidationError(
      `Glob base path is outside MORPHUI_KNOWLEDGE_ALLOWED_ROOTS: "${pattern}".`,
    );
  }
  const regex = globToRegExp(absolute);
  const candidateFiles = await walkDir(base || process.cwd(), allowedRoots);
  return candidateFiles.filter((file) => regex.test(file));
}

async function walkDir(root: string, allowedRoots: string[]): Promise<string[]> {
  if (!(await isPathAllowed(root, allowedRoots))) {
    throw new ValidationError(
      `Directory is outside MORPHUI_KNOWLEDGE_ALLOWED_ROOTS: "${root}".`,
    );
  }

  const out: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (!(await isPathAllowed(fullPath, allowedRoots))) continue;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        stack.push(fullPath);
      } else if (entry.isFile() && isSupportedFile(fullPath)) {
        out.push(fullPath);
      }
    }
  }

  return out;
}

function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function inferComponentId(filePath: string): string {
  const fileName = path.basename(filePath).replace(/\.(stories\.)?[a-z0-9]+$/i, "");
  return fileName
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

function chunkDocument(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > 1000 && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 200);
}

function tokenize(input: string): string[] {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3),
    ),
  );
}

function scoreText(text: string, terms: string[]): number {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = normalized.match(new RegExp(escaped, "g"));
    if (matches) {
      score += matches.length;
    }
  }
  return score;
}

function toStableId(prefix: string, value: string): string {
  return `${prefix}_${sha256(value).slice(0, 16)}`;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function globToRegExp(globPattern: string): RegExp {
  const escaped = globPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = escaped
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`);
}

function isGlobPattern(input: string): boolean {
  return input.includes("*") || input.includes("?");
}

function isKnowledgeGlobbingEnabled(): boolean {
  const raw = (process.env.MORPHUI_KNOWLEDGE_ALLOW_GLOBS || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

async function resolveAllowedRoots(): Promise<string[]> {
  const configured = (process.env.MORPHUI_KNOWLEDGE_ALLOWED_ROOTS || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const inputRoots = configured.length > 0 ? configured : DEFAULT_ALLOWED_ROOTS;

  const roots: string[] = [];
  for (const root of inputRoots) {
    if (configured.length > 0 && !path.isAbsolute(root)) {
      throw new Error(
        `MORPHUI_KNOWLEDGE_ALLOWED_ROOTS entries must be absolute paths. Invalid entry: "${root}"`,
      );
    }
    roots.push(await resolveSecurityPath(path.resolve(root)));
  }

  return Array.from(new Set(roots));
}

async function isPathAllowed(candidatePath: string, allowedRoots: string[]): Promise<boolean> {
  const resolvedCandidate = await resolveSecurityPath(path.resolve(candidatePath));
  return allowedRoots.some((root) => isWithinRoot(resolvedCandidate, root));
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  if (!relative) return true;
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function resolveSecurityPath(inputPath: string): Promise<string> {
  return fs.realpath(inputPath).catch(() => path.resolve(inputPath));
}
