import { lstat, readFile, readlink, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const canonicalSkills = path.join(root, '.agents', 'skills');
const claudeSkills = path.join(root, '.claude', 'skills');

function fail(message) {
  throw new Error(`Agent configuration invalid: ${message}`);
}

async function requireDirectory(directory, label) {
  const stats = await lstat(directory).catch(() => null);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) {
    fail(
      `${label} must be a real directory: ${path.relative(root, directory)}`,
    );
  }
}

function frontmatterValue(frontmatter, key) {
  const match = frontmatter.match(
    new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'),
  );
  return match?.[1]?.trim() ?? null;
}

async function validateSkills() {
  await requireDirectory(canonicalSkills, 'Canonical skills directory');

  const claudeStats = await lstat(claudeSkills).catch(() => null);
  if (!claudeStats?.isSymbolicLink()) {
    fail('.claude/skills must be a symlink, not a copied directory');
  }
  const target = await readlink(claudeSkills);
  if (target !== '../.agents/skills') {
    fail(`.claude/skills must target ../.agents/skills (found ${target})`);
  }
  if ((await realpath(claudeSkills)) !== (await realpath(canonicalSkills))) {
    fail('.claude/skills does not resolve to the canonical skills directory');
  }

  const entries = await readdir(canonicalSkills, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(canonicalSkills, entry.name, 'SKILL.md');
    const contents = await readFile(skillFile, 'utf8').catch(() => null);
    if (!contents) fail(`${entry.name} is missing SKILL.md`);
    const match = contents.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) fail(`${entry.name}/SKILL.md is missing YAML frontmatter`);
    const name = frontmatterValue(match[1], 'name');
    const description = frontmatterValue(match[1], 'description');
    if (name !== entry.name) {
      fail(`${entry.name}/SKILL.md name must match its directory`);
    }
    if (!description || description.includes('TODO')) {
      fail(`${entry.name}/SKILL.md needs a complete description`);
    }
  }
}

async function validateGuidanceSymlink() {
  const claudeGuidance = path.join(root, 'CLAUDE.md');
  const stats = await lstat(claudeGuidance).catch(() => null);
  if (!stats?.isSymbolicLink())
    fail('CLAUDE.md must be a symlink to AGENTS.md');
  const target = await readlink(claudeGuidance);
  if (target !== 'AGENTS.md') {
    fail(`CLAUDE.md must target AGENTS.md (found ${target})`);
  }
}

async function validatePlanIgnore() {
  const gitignore = await readFile(path.join(root, '.gitignore'), 'utf8');
  if (!gitignore.split(/\r?\n/).includes('/.agents/plans/')) {
    fail('.gitignore must ignore /.agents/plans/');
  }
}

await validateSkills();
await validateGuidanceSymlink();
await validatePlanIgnore();
console.log('Agent configuration is valid.');
