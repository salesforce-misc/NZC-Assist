/**
 * Knowledge-base tools: list_nzc_modules, get_nzc_module_docs,
 * search_nzc_knowledge, explain_nzc_concept, get_nzc_troubleshooting.
 *
 * Reads the curated Markdown under knowledge/ (not knowledge/validation-rules/,
 * which is YAML and belongs to the validation loader instead). Search is a
 * plain keyword scan over heading-delimited sections — no embeddings, no new
 * dependency — which is enough for a curated, hand-written knowledge base of
 * this size.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { pluginPath } from "./paths.js";

const KNOWLEDGE_ROOT = pluginPath("knowledge");
const MODULES_ROOT = join(KNOWLEDGE_ROOT, "modules");

export interface ModuleSummary {
  slug: string;
  path: string;
}

export async function listNzcModules(): Promise<ModuleSummary[]> {
  const entries = await readdir(MODULES_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => ({ slug: e.name, path: `knowledge/modules/${e.name}/README.md` }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function getNzcModuleDocs(module: string): Promise<{ slug: string; content: string }> {
  const path = join(MODULES_ROOT, module, "README.md");
  try {
    const content = await readFile(path, "utf8");
    return { slug: module, content };
  } catch {
    const available = await listNzcModules();
    throw new Error(
      `No module docs found for "${module}". Available modules: ${available.map((m) => m.slug).join(", ")}.`
    );
  }
}

interface Section {
  file: string; // relative to knowledge/
  heading: string;
  body: string;
}

function splitIntoSections(relPath: string, text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let currentHeading = relPath;
  let buffer: string[] = [];
  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body.length > 0) sections.push({ file: relPath, heading: currentHeading, body });
    buffer = [];
  };
  for (const line of lines) {
    const headingMatch = /^#{1,6}\s+(.*)$/.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

async function loadAllSections(): Promise<Section[]> {
  const entries = await readdir(KNOWLEDGE_ROOT, { withFileTypes: true, recursive: true });
  const sections: Section[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const parentDir = (entry as unknown as { parentPath?: string; path?: string }).parentPath ??
      (entry as unknown as { path?: string }).path ??
      KNOWLEDGE_ROOT;
    const fullPath = join(parentDir, entry.name);
    if (relative(KNOWLEDGE_ROOT, fullPath).startsWith("validation-rules")) continue;
    const text = await readFile(fullPath, "utf8");
    sections.push(...splitIntoSections(relative(KNOWLEDGE_ROOT, fullPath), text));
  }
  return sections;
}

function score(section: Section, terms: string[]): number {
  const haystack = `${section.heading}\n${section.body}`.toLowerCase();
  let total = 0;
  for (const term of terms) {
    const t = term.toLowerCase();
    if (!t) continue;
    if (section.heading.toLowerCase().includes(t)) total += 5;
    const bodyMatches = haystack.split(t).length - 1;
    total += bodyMatches;
  }
  return total;
}

export interface KnowledgeMatch {
  file: string;
  heading: string;
  excerpt: string;
  score: number;
}

export async function searchNzcKnowledge(query: string, limit = 10): Promise<KnowledgeMatch[]> {
  const terms = query.split(/\s+/).filter(Boolean);
  const sections = await loadAllSections();
  const scored = sections
    .map((s) => ({ section: s, score: score(s, terms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored.map(({ section, score: sc }) => ({
    file: section.file,
    heading: section.heading,
    excerpt: section.body.length > 400 ? `${section.body.slice(0, 400)}…` : section.body,
    score: sc,
  }));
}

export async function explainNzcConcept(concept: string): Promise<KnowledgeMatch[]> {
  const sections = await loadAllSections();
  const exact = sections.filter((s) => s.heading.toLowerCase() === concept.toLowerCase());
  if (exact.length > 0) {
    return exact.map((s) => ({ file: s.file, heading: s.heading, excerpt: s.body, score: 100 }));
  }
  return searchNzcKnowledge(concept, 5);
}

export async function getNzcTroubleshooting(issue: string): Promise<KnowledgeMatch[]> {
  const text = await readFile(join(KNOWLEDGE_ROOT, "troubleshooting", "common-issues.md"), "utf8");
  const sections = splitIntoSections("troubleshooting/common-issues.md", text);
  const terms = issue.split(/\s+/).filter(Boolean);
  const scored = sections
    .map((s) => ({ section: s, score: score(s, terms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) {
    return [
      {
        file: "troubleshooting/common-issues.md",
        heading: "(no exact match)",
        excerpt: "No matching entry found. Run search_nzc_knowledge for a broader search, or see nzc-troubleshoot skill's 10-step diagnostic checklist.",
        score: 0,
      },
    ];
  }
  return scored.map(({ section, score: sc }) => ({
    file: section.file,
    heading: section.heading,
    excerpt: section.body,
    score: sc,
  }));
}
