export function isRagEnabled(): boolean {
  const raw = (process.env.MORPHUI_LLM_USE_RAG || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
