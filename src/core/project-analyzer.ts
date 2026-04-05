import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Framework =
  | 'nextjs'
  | 'nuxt'
  | 'remix'
  | 'astro'
  | 'sveltekit'
  | 'vite'
  | 'express'
  | 'nestjs'
  | 'fastapi'
  | 'django'
  | 'rails'
  | 'laravel'
  | 'spring-boot'
  | 'hono'
  | 'fastify'
  | 'flask'
  | 'go'
  | 'unknown';

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm' | 'pip' | 'poetry' | 'cargo' | 'go' | 'unknown';

export type MonorepoTool = 'turborepo' | 'nx' | 'lerna' | 'workspaces' | 'none';

export interface EnvSuggestion {
  readonly filename: string;
  readonly reason: string;
  readonly keys?: ReadonlyArray<string>;
}

export interface ScriptSuggestion {
  readonly name: string;
  readonly command: string;
  readonly reason: string;
}

export interface ProjectAnalysis {
  readonly framework: Framework;
  readonly frameworkVersion?: string;
  readonly packageManager: PackageManager;
  readonly monorepo: MonorepoTool;
  readonly workspaces: ReadonlyArray<string>;
  readonly hasDocker: boolean;
  readonly hasTypeScript: boolean;
  readonly suggestedEnvFiles: ReadonlyArray<EnvSuggestion>;
  readonly suggestedScripts: ReadonlyArray<ScriptSuggestion>;
  readonly suggestedDevCommand: string;
  readonly warnings: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Main analyzer
// ---------------------------------------------------------------------------

export function analyzeProject(cwd: string = process.cwd()): ProjectAnalysis {
  const packageManager = detectPackageManager(cwd);
  const framework = detectFramework(cwd);
  const monorepo = detectMonorepo(cwd);
  const workspaces = monorepo !== 'none' ? detectWorkspaces(cwd) : [];
  const hasDocker = fs.existsSync(path.join(cwd, 'Dockerfile'))
    || fs.existsSync(path.join(cwd, 'docker-compose.yml'))
    || fs.existsSync(path.join(cwd, 'compose.yml'));
  const hasTypeScript = fs.existsSync(path.join(cwd, 'tsconfig.json'));

  const suggestedEnvFiles = suggestEnvFiles(framework, monorepo, workspaces, cwd);
  const suggestedScripts = suggestScripts(framework, packageManager, cwd);
  const suggestedDevCommand = buildDevCommand(packageManager, framework, cwd);
  const warnings = detectWarnings(cwd);

  return {
    framework,
    packageManager,
    monorepo,
    workspaces,
    hasDocker,
    hasTypeScript,
    suggestedEnvFiles,
    suggestedScripts,
    suggestedDevCommand,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Framework detection
// ---------------------------------------------------------------------------

function detectFramework(cwd: string): Framework {
  // Check config files first (most reliable)
  const configChecks: ReadonlyArray<[string, Framework]> = [
    ['next.config.ts', 'nextjs'],
    ['next.config.js', 'nextjs'],
    ['next.config.mjs', 'nextjs'],
    ['nuxt.config.ts', 'nuxt'],
    ['nuxt.config.js', 'nuxt'],
    ['astro.config.mjs', 'astro'],
    ['astro.config.ts', 'astro'],
    ['svelte.config.js', 'sveltekit'],
    ['remix.config.js', 'remix'],
    ['vite.config.ts', 'vite'],
    ['vite.config.js', 'vite'],
    ['manage.py', 'django'],
    ['Gemfile', 'rails'],
    ['artisan', 'laravel'],
    ['go.mod', 'go'],
  ];

  for (const [file, fw] of configChecks) {
    if (fs.existsSync(path.join(cwd, file))) return fw;
  }

  // Check package.json dependencies
  const pkg = readPackageJson(cwd);
  if (pkg) {
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    if ('next' in allDeps) return 'nextjs';
    if ('nuxt' in allDeps) return 'nuxt';
    if ('astro' in allDeps) return 'astro';
    if ('@sveltejs/kit' in allDeps) return 'sveltekit';
    if ('@remix-run/node' in allDeps) return 'remix';
    if ('@nestjs/core' in allDeps) return 'nestjs';
    if ('hono' in allDeps) return 'hono';
    if ('fastify' in allDeps) return 'fastify';
    if ('express' in allDeps) return 'express';
  }

  // Check Python frameworks
  if (fs.existsSync(path.join(cwd, 'requirements.txt'))) {
    const reqs = safeReadFile(path.join(cwd, 'requirements.txt'));
    if (reqs.includes('fastapi')) return 'fastapi';
    if (reqs.includes('django')) return 'django';
    if (reqs.includes('flask')) return 'flask';
  }

  if (fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
    const pyproject = safeReadFile(path.join(cwd, 'pyproject.toml'));
    if (pyproject.includes('fastapi')) return 'fastapi';
    if (pyproject.includes('django')) return 'django';
    if (pyproject.includes('flask')) return 'flask';
  }

  // Check Java/Spring
  if (fs.existsSync(path.join(cwd, 'pom.xml'))) {
    const pom = safeReadFile(path.join(cwd, 'pom.xml'));
    if (pom.includes('spring-boot')) return 'spring-boot';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Package manager detection
// ---------------------------------------------------------------------------

function detectPackageManager(cwd: string): PackageManager {
  // Lock files are the most reliable signal
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) return 'npm';

  // Python
  if (fs.existsSync(path.join(cwd, 'poetry.lock'))) return 'poetry';
  if (fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'Pipfile'))) return 'pip';

  // Go / Rust
  if (fs.existsSync(path.join(cwd, 'go.mod'))) return 'go';
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return 'cargo';

  // Fallback: check packageManager field
  const pkg = readPackageJson(cwd);
  if (pkg?.packageManager) {
    if (pkg.packageManager.startsWith('pnpm')) return 'pnpm';
    if (pkg.packageManager.startsWith('yarn')) return 'yarn';
    if (pkg.packageManager.startsWith('bun')) return 'bun';
  }

  if (fs.existsSync(path.join(cwd, 'package.json'))) return 'npm';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Monorepo detection
// ---------------------------------------------------------------------------

function detectMonorepo(cwd: string): MonorepoTool {
  if (fs.existsSync(path.join(cwd, 'turbo.json'))) return 'turborepo';
  if (fs.existsSync(path.join(cwd, 'nx.json'))) return 'nx';
  if (fs.existsSync(path.join(cwd, 'lerna.json'))) return 'lerna';

  const pkg = readPackageJson(cwd);
  if (pkg?.workspaces) return 'workspaces';

  // pnpm-workspace.yaml
  if (fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml'))) return 'workspaces';

  return 'none';
}

function detectWorkspaces(cwd: string): ReadonlyArray<string> {
  const results: string[] = [];

  // Check pnpm-workspace.yaml
  const pnpmWs = path.join(cwd, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmWs)) {
    try {
      const content = fs.readFileSync(pnpmWs, 'utf8');
      const parsed = parseYaml(content) as { packages?: string[] };
      if (parsed?.packages) {
        for (const pattern of parsed.packages) {
          results.push(...resolveWorkspacePattern(cwd, pattern));
        }
      }
    } catch { /* skip */ }
  }

  // Check package.json workspaces
  const pkg = readPackageJson(cwd);
  if (pkg?.workspaces) {
    const patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages ?? [];
    for (const pattern of patterns) {
      results.push(...resolveWorkspacePattern(cwd, pattern));
    }
  }

  return results;
}

function resolveWorkspacePattern(cwd: string, pattern: string): string[] {
  // Simple glob: "apps/*", "packages/*"
  const cleanPattern = pattern.replace(/\/\*$/, '');
  const dir = path.join(cwd, cleanPattern);

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];

  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(cleanPattern, e.name));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Env file suggestions
// ---------------------------------------------------------------------------

function suggestEnvFiles(
  framework: Framework,
  monorepo: MonorepoTool,
  workspaces: ReadonlyArray<string>,
  cwd: string,
): ReadonlyArray<EnvSuggestion> {
  const suggestions: EnvSuggestion[] = [];

  // Always suggest root .env if it exists or framework expects it
  if (monorepo === 'none') {
    suggestions.push({
      filename: '.env',
      reason: 'Root environment variables',
      keys: suggestKeysForFramework(framework),
    });
  }

  // Framework-specific suggestions
  switch (framework) {
    case 'nextjs':
      suggestions.push({
        filename: '.env.local',
        reason: 'Next.js local overrides (gitignored by default)',
        keys: ['DATABASE_URL', 'NEXT_PUBLIC_API_URL', 'NEXTAUTH_SECRET'],
      });
      break;
    case 'django':
    case 'fastapi':
    case 'flask':
      suggestions.push({
        filename: '.env',
        reason: `${framework} environment config`,
        keys: ['DATABASE_URL', 'SECRET_KEY', 'DEBUG', 'ALLOWED_HOSTS'],
      });
      break;
    case 'rails':
      suggestions.push({
        filename: '.env',
        reason: 'Rails environment config',
        keys: ['DATABASE_URL', 'SECRET_KEY_BASE', 'RAILS_ENV'],
      });
      break;
  }

  // Monorepo: suggest per-workspace env files
  if (monorepo !== 'none' && workspaces.length > 0) {
    for (const ws of workspaces) {
      const wsPath = path.join(cwd, ws);
      // Check if the workspace has its own package.json or similar
      if (fs.existsSync(path.join(wsPath, 'package.json'))
        || fs.existsSync(path.join(wsPath, 'requirements.txt'))) {
        const wsName = path.basename(ws);
        suggestions.push({
          filename: `.env.${wsName}`,
          reason: `Environment for ${ws}`,
        });
      }
    }
  }

  // If we found existing env files that aren't in suggestions, add them
  const existingFiles = findExistingEnvFiles(cwd);
  for (const f of existingFiles) {
    if (!suggestions.some((s) => s.filename === f)) {
      suggestions.push({
        filename: f,
        reason: 'Existing env file found on disk',
      });
    }
  }

  return suggestions;
}

function suggestKeysForFramework(framework: Framework): string[] {
  switch (framework) {
    case 'nextjs':
      return ['DATABASE_URL', 'NEXT_PUBLIC_API_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'];
    case 'express':
    case 'fastify':
    case 'hono':
    case 'nestjs':
      return ['DATABASE_URL', 'PORT', 'JWT_SECRET', 'REDIS_URL'];
    case 'django':
      return ['DATABASE_URL', 'SECRET_KEY', 'DEBUG', 'ALLOWED_HOSTS'];
    case 'fastapi':
    case 'flask':
      return ['DATABASE_URL', 'SECRET_KEY', 'DEBUG'];
    case 'rails':
      return ['DATABASE_URL', 'SECRET_KEY_BASE', 'RAILS_ENV'];
    case 'laravel':
      return ['DB_CONNECTION', 'DB_HOST', 'DB_DATABASE', 'APP_KEY'];
    default:
      return ['DATABASE_URL'];
  }
}

function findExistingEnvFiles(cwd: string): string[] {
  try {
    return fs.readdirSync(cwd)
      .filter((f) => {
        if (f === '.env' || f.startsWith('.env.')) return true;
        if (f.endsWith('.env') && f.length > 4) return true;
        return false;
      })
      .filter((f) => {
        try { return fs.statSync(path.join(cwd, f)).isFile(); } catch { return false; }
      });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Script suggestions
// ---------------------------------------------------------------------------

function suggestScripts(
  framework: Framework,
  packageManager: PackageManager,
  cwd: string,
): ReadonlyArray<ScriptSuggestion> {
  const run = runPrefix(packageManager);
  const suggestions: ScriptSuggestion[] = [];

  // Read actual scripts from package.json
  const pkg = readPackageJson(cwd);
  const scripts = pkg?.scripts ?? {};

  if ('dev' in scripts) {
    suggestions.push({ name: 'dev', command: `${run} dev`, reason: 'Dev server from package.json' });
  }
  if ('start' in scripts) {
    suggestions.push({ name: 'start', command: `${run} start`, reason: 'Start server from package.json' });
  }
  if ('dev:backend' in scripts) {
    suggestions.push({ name: 'dev:backend', command: `${run} dev:backend`, reason: 'Backend dev server' });
  }
  if ('dev:frontend' in scripts) {
    suggestions.push({ name: 'dev:frontend', command: `${run} dev:frontend`, reason: 'Frontend dev server' });
  }

  // Framework defaults if no scripts found
  if (suggestions.length === 0) {
    switch (framework) {
      case 'django':
        suggestions.push({ name: 'dev', command: 'python manage.py runserver', reason: 'Django dev server' });
        break;
      case 'fastapi':
        suggestions.push({ name: 'dev', command: 'uvicorn main:app --reload', reason: 'FastAPI dev server' });
        break;
      case 'flask':
        suggestions.push({ name: 'dev', command: 'flask run --reload', reason: 'Flask dev server' });
        break;
      case 'rails':
        suggestions.push({ name: 'dev', command: 'bin/rails server', reason: 'Rails dev server' });
        break;
      case 'go':
        suggestions.push({ name: 'dev', command: 'go run .', reason: 'Go run' });
        break;
    }
  }

  return suggestions;
}

function buildDevCommand(packageManager: PackageManager, framework: Framework, cwd: string): string {
  const pkg = readPackageJson(cwd);
  if (pkg?.scripts?.['dev']) return `${runPrefix(packageManager)} dev`;

  switch (framework) {
    case 'django': return 'python manage.py runserver';
    case 'fastapi': return 'uvicorn main:app --reload';
    case 'flask': return 'flask run --reload';
    case 'rails': return 'bin/rails server';
    case 'go': return 'go run .';
    default: return `${runPrefix(packageManager)} dev`;
  }
}

function runPrefix(pm: PackageManager): string {
  switch (pm) {
    case 'pnpm': return 'pnpm';
    case 'yarn': return 'yarn';
    case 'bun': return 'bun run';
    case 'npm': return 'npm run';
    default: return 'npm run';
  }
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

function detectWarnings(cwd: string): ReadonlyArray<string> {
  const warnings: string[] = [];

  // Check if .env is in .gitignore
  const gitignore = safeReadFile(path.join(cwd, '.gitignore'));
  if (gitignore && !gitignore.includes('.env')) {
    warnings.push('.env is not in .gitignore — secrets may be committed to git');
  }

  // Check for hardcoded secrets in common config files
  const envExample = safeReadFile(path.join(cwd, '.env.example'));
  if (envExample) {
    const hasRealValues = /(?:sk_live|pk_live|ghp_|gho_|AKIA|password123|secret123)/i.test(envExample);
    if (hasRealValues) {
      warnings.push('.env.example may contain real secrets — review before committing');
    }
  }

  // Check for .env committed to git
  try {
    const gitLsFiles = require('node:child_process')
      .execSync('git ls-files .env', { cwd, encoding: 'utf8', timeout: 5000 })
      .trim();
    if (gitLsFiles === '.env') {
      warnings.push('.env is tracked by git — run "git rm --cached .env" to untrack it');
    }
  } catch { /* not in git or git not available */ }

  return warnings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PackageJson {
  readonly name?: string;
  readonly scripts?: Record<string, string>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly workspaces?: string[] | { packages?: string[] };
  readonly packageManager?: string;
}

function readPackageJson(cwd: string): PackageJson | null {
  try {
    const content = fs.readFileSync(path.join(cwd, 'package.json'), 'utf8');
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

function safeReadFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}
