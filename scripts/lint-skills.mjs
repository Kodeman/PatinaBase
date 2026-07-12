#!/usr/bin/env node
/*
 * lint-skills.mjs
 * ------------------------------------------------------------------------
 * WHAT THIS DOES
 * Validates every `.claude/skills/<dir>/SKILL.md` in the repo against the
 * minimal contract Claude Code (and Cowork) skills must satisfy:
 *
 *   1. The file starts with a YAML frontmatter fence (`---` ... `---`).
 *   2. Frontmatter has non-empty `name:` and `description:` keys. Unknown
 *      extra keys are tolerated (some patina-* skills carry more).
 *   3. `name` equals the skill's directory name and is kebab-case
 *      (lowercase letters/digits, hyphen-separated, no leading/trailing/
 *      double hyphens).
 *   4. `description` is non-empty and <= 1024 chars.
 *   5. The whole SKILL.md file is under 500 lines.
 *   6. Every `references/<something>` path string mentioned in the body
 *      resolves to a real file on disk, relative to the skill's directory.
 *   7. Skill `name`s are unique across the whole tree.
 *
 * This is intentionally NOT a full YAML parser — frontmatter here is a
 * simple `key: value` block, optionally with folded/multi-line scalars
 * (the pattern every skill in this repo actually uses: a top-level key
 * followed by indented continuation lines). We only need `name` and
 * `description`, so a hand-rolled scanner is enough and keeps this script
 * at zero npm dependencies (Node stdlib only), matching the precedent set
 * by scripts/dedupe-client-reference-manifests.mjs.
 *
 * Exit 0 = every skill is clean. Exit 1 = at least one problem, with
 * pointed per-file messages printed to stderr.
 *
 * Invocation:
 *   node scripts/lint-skills.mjs
 * or via the package.json script:
 *   pnpm lint:skills
 * ------------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(REPO_ROOT, '.claude', 'skills');
const MAX_DESCRIPTION_LEN = 1024;
const MAX_SKILL_MD_LINES = 500;
const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Collected problems: { skill, message } */
const problems = [];

function fail(skillName, message) {
  problems.push({ skill: skillName, message });
}

/**
 * Extract the raw frontmatter block (the text between the first two `---`
 * fence lines) and the body (everything after the closing fence).
 * Returns null if no valid opening fence is found at the very top.
 */
function splitFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') {
    return null;
  }
  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    return null;
  }
  const frontmatterLines = lines.slice(1, closeIdx);
  const bodyLines = lines.slice(closeIdx + 1);
  return { frontmatterLines, bodyLines, totalLines: lines.length };
}

/**
 * Hand-rolled top-level `key: value` extractor for the frontmatter block.
 * Supports folded scalars where a key's value continues on subsequent
 * indented lines (the pattern every SKILL.md in this repo uses for long
 * `description:` fields), joining continuation lines with a single space.
 * Does not attempt full YAML (lists, nested maps, quoting) — not needed
 * for `name`/`description` in this repo's skills.
 *
 * Returns a Map<key, string value>.
 */
function parseFrontmatterKeys(frontmatterLines) {
  const keys = new Map();
  let currentKey = null;
  let currentValueParts = [];

  const flush = () => {
    if (currentKey !== null) {
      keys.set(currentKey, currentValueParts.join(' ').trim());
    }
    currentKey = null;
    currentValueParts = [];
  };

  for (const rawLine of frontmatterLines) {
    if (rawLine.trim() === '') {
      continue;
    }
    const topLevelMatch = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(rawLine);
    const isIndented = /^\s+/.test(rawLine);
    if (topLevelMatch && !isIndented) {
      flush();
      currentKey = topLevelMatch[1];
      currentValueParts = topLevelMatch[2] ? [topLevelMatch[2].trim()] : [];
    } else if (currentKey !== null) {
      // Continuation line of a folded scalar.
      currentValueParts.push(rawLine.trim());
    }
    // Lines before any top-level key (shouldn't happen) are ignored.
  }
  flush();

  // Strip a single layer of matching quotes if present.
  for (const [k, v] of keys) {
    if (
      (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
      (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
    ) {
      keys.set(k, v.slice(1, -1));
    }
  }

  return keys;
}

/**
 * Find every `references/<something>` path string mentioned in the body
 * text, e.g. "references/rubric.md" or "`references/patina-facts.md`".
 * Matches a run of non-whitespace, non-backtick, non-paren, non-quote
 * characters after "references/" so trailing punctuation in prose
 * (periods, commas, closing parens/backticks) doesn't get swept in.
 */
function findReferencedPaths(bodyText) {
  const found = new Set();
  const re = /references\/[^\s`)'"]+/g;
  let match;
  while ((match = re.exec(bodyText)) !== null) {
    let ref = match[0];
    // Trim common trailing punctuation that isn't part of a path.
    ref = ref.replace(/[.,;:]+$/, '');
    found.add(ref);
  }
  return [...found];
}

function lintSkill(skillDirName, skillDirPath, seenNames) {
  const skillMdPath = path.join(skillDirPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    fail(skillDirName, `missing SKILL.md at ${path.relative(REPO_ROOT, skillMdPath)}`);
    return;
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const split = splitFrontmatter(content);
  if (!split) {
    fail(
      skillDirName,
      `SKILL.md does not start with a valid YAML frontmatter fence (leading "---" ... "---" block)`
    );
    return;
  }

  const { frontmatterLines, bodyLines, totalLines } = split;
  const keys = parseFrontmatterKeys(frontmatterLines);

  // --- name ---
  const name = keys.get('name');
  if (!name) {
    fail(skillDirName, `frontmatter missing required "name" key`);
  } else {
    if (name !== skillDirName) {
      fail(
        skillDirName,
        `frontmatter "name: ${name}" does not match directory name "${skillDirName}"`
      );
    }
    if (!KEBAB_CASE_RE.test(name)) {
      fail(
        skillDirName,
        `"name: ${name}" is not kebab-case (expected lowercase letters/digits, hyphen-separated)`
      );
    }
    if (seenNames.has(name)) {
      fail(skillDirName, `duplicate skill name "${name}" (already used by another skill dir)`);
    } else {
      seenNames.add(name);
    }
  }

  // --- description ---
  const description = keys.get('description');
  if (!description || description.trim() === '') {
    fail(skillDirName, `frontmatter missing required non-empty "description" key`);
  } else if (description.length > MAX_DESCRIPTION_LEN) {
    fail(
      skillDirName,
      `"description" is ${description.length} chars, exceeds ${MAX_DESCRIPTION_LEN} char limit`
    );
  }

  // --- line count ---
  if (totalLines > MAX_SKILL_MD_LINES) {
    fail(
      skillDirName,
      `SKILL.md is ${totalLines} lines, exceeds the ${MAX_SKILL_MD_LINES}-line limit`
    );
  }

  // --- references/ paths exist on disk ---
  const bodyText = bodyLines.join('\n');
  const referencedPaths = findReferencedPaths(bodyText);
  for (const refPath of referencedPaths) {
    const resolved = path.join(skillDirPath, refPath);
    if (!fs.existsSync(resolved)) {
      fail(
        skillDirName,
        `body references "${refPath}" but ${path.relative(REPO_ROOT, resolved)} does not exist on disk`
      );
    }
  }
}

function main() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`lint-skills: no skills directory found at ${SKILLS_DIR}`);
    process.exit(1);
  }

  const entries = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  if (entries.length === 0) {
    console.error(`lint-skills: no skill directories found under ${SKILLS_DIR}`);
    process.exit(1);
  }

  const seenNames = new Set();
  for (const dirName of entries) {
    lintSkill(dirName, path.join(SKILLS_DIR, dirName), seenNames);
  }

  if (problems.length > 0) {
    console.error(`lint-skills: ${problems.length} problem(s) found:\n`);
    for (const { skill, message } of problems) {
      console.error(`  [${skill}] ${message}`);
    }
    console.error(`\nlint-skills: FAILED (${entries.length} skill(s) checked)`);
    process.exit(1);
  }

  console.log(`lint-skills: OK — ${entries.length} skill(s) checked, no problems found.`);
  process.exit(0);
}

main();
