import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { checkbox, confirm } from '@inquirer/prompts';
import ora from 'ora';
import pc from 'picocolors';
import { loadCommandContext, requireRepoAccess } from './shared.js';
import { loadRepoKey } from '../core/key-store.js';
import { serializeEnvFile } from '../core/env-file.js';
import { createApiClient } from '../core/api-client.js';
import { loadProjectConfig } from '../core/config.js';
import { buildEnvKey, assertSafeFilename } from '../core/env-namespacing.js';
import { pullEntriesFromServer, tryPullManifest } from '../core/env-resolver.js';
import { VALID_OUTPUT_FORMATS } from '../constants.js';
import { Errors, BoltenvError } from '../utils/errors.js';
import { actionSuccess, hint } from '../utils/branding.js';
import type { EnvEntry } from '../types/index.js';

interface PullOptions {
  readonly env?: string;
  readonly repo?: string;
  readonly version?: string;
  readonly stdout: boolean;
  readonly format: string;
  readonly yes: boolean;
}

export function registerPull(program: Command): void {
  program
    .command('pull')
    .description('Download and decrypt .env files from shared storage')
    .argument('[file]', 'Output file path (omit to auto-detect all pushed files)')
    .option('-e, --env <environment>', 'Source environment')
    .option('-r, --repo <owner/repo>', 'Target repo (default: auto-detect from git)')
    .option('--version <version>', 'Pull a specific version')
    .option('--stdout', 'Print to stdout instead of file', false)
    .option('--format <fmt>', 'Output format: dotenv | json | shell', 'dotenv')
    .option('-y, --yes', 'Skip confirmation prompts', false)
    .action(async (file: string | undefined, options: PullOptions) => {
      if (!(VALID_OUTPUT_FORMATS as readonly string[]).includes(options.format)) {
        throw Errors.invalidFormat(options.format);
      }

      if (options.version !== undefined) {
        const parsed = parseInt(options.version, 10);
        if (Number.isNaN(parsed) || parsed <= 0) {
          throw Errors.invalidVersion(options.version);
        }
      }

      if (file !== undefined) {
        await pullSingleFile(file, options);
      } else {
        await pullMultiFile(options);
      }
    });
}

// ---------------------------------------------------------------------------
// Single-file pull (explicit file path given)
// ---------------------------------------------------------------------------

async function pullSingleFile(file: string, options: PullOptions): Promise<void> {
  const ctx = loadCommandContext(options.env, options.repo);
  await requireRepoAccess(ctx);
  const environment = ctx.environment;

  const masterKey = loadRepoKey(ctx.repo.fullName);
  if (!masterKey) {
    throw Errors.keyNotFound(ctx.repo.fullName);
  }

  // Validate and use namespaced env key: .env.backend → "development::.env.backend"
  const filename = path.basename(file);
  assertSafeFilename(filename);
  const envKey = buildEnvKey(environment, filename);

  const spinner = ora(`Pulling ${pc.bold(filename)} from ${pc.yellow(envKey)}...`).start();

  const api = createApiClient({
    baseUrl: ctx.apiBaseUrl,
    token: ctx.auth.accessToken,
    repo: ctx.repo.fullName,
  });

  const versionNum = options.version ? parseInt(options.version, 10) : undefined;
  const entries = await pullEntriesFromServer(envKey, masterKey, api, versionNum);
  spinner.stop();

  if (entries.length === 0) {
    console.log(pc.yellow(`  ${filename} has 0 variables on the server — skipping write.`));
    console.log(hint('The pushed data may be empty or corrupted. Ask your teammate to re-push.'));
    return;
  }

  const output = formatOutput(entries, options.format);

  if (options.stdout) {
    process.stdout.write(output);
  } else {
    await writeEnvFile(file, output, options.yes);
    console.log(actionSuccess(
      `${pc.bold(filename)} ${pc.dim('←')} ${pc.cyan(ctx.repo.fullName)}:${pc.yellow(envKey)} ${pc.dim(`(${entries.length} vars)`)}`,
    ));
  }
}

// ---------------------------------------------------------------------------
// Multi-file pull (auto-detect from config/manifest)
// ---------------------------------------------------------------------------

async function pullMultiFile(options: PullOptions): Promise<void> {
  if (options.version) {
    throw new BoltenvError(
      '--version cannot be used with multi-file pull.',
      'VERSION_AMBIGUOUS',
      'Each file has independent version history. Pull a specific file instead:\n'
        + '  boltenv pull .env.backend --version 3',
    );
  }

  const config = loadProjectConfig();
  const ctx = loadCommandContext(options.env, options.repo);
  await requireRepoAccess(ctx);
  const environment = ctx.environment;

  const masterKey = loadRepoKey(ctx.repo.fullName);
  if (!masterKey) {
    throw Errors.keyNotFound(ctx.repo.fullName);
  }

  const api = createApiClient({
    baseUrl: ctx.apiBaseUrl,
    token: ctx.auth.accessToken,
    repo: ctx.repo.fullName,
  });

  // Step 1: Determine file list
  let fileList: string[];

  if (config?.files && config.files.length > 0) {
    // Config knows the file list — validate every entry before trusting it
    for (const f of config.files) {
      assertSafeFilename(f);
    }
    fileList = [...config.files];
    console.log(pc.dim(`  Using file list from .boltenv.yaml`));
  } else {
    // Try to pull manifest from server
    const spinner = ora('Checking for multi-file manifest...').start();
    const manifest = await tryPullManifest(environment, masterKey, api);
    spinner.stop();

    if (manifest && manifest.length > 0) {
      fileList = [...manifest];
      console.log(pc.dim(`  Found ${manifest.length} files on server for ${pc.yellow(environment)}`));
    } else {
      // No manifest, no config — fall back to pulling plain .env (backward compat)
      console.log(pc.dim('  No multi-file manifest found. Pulling default .env'));
      await pullSingleFile('.env', options);
      return;
    }
  }

  // Step 2: Show files and let user select
  console.log(`\n  ${pc.yellow('⚡')} ${pc.bold(String(fileList.length))} env files for ${pc.yellow(environment)}:\n`);
  for (const f of fileList) {
    console.log(`     ${pc.white(f)}`);
  }
  console.log();

  let selected: string[];

  if (options.yes || options.stdout) {
    selected = fileList;
  } else {
    const selectedNames = await checkbox({
      message: 'Select files to pull:',
      choices: fileList.map((f) => ({
        name: f,
        value: f,
        checked: true,
      })),
    });

    if (selectedNames.length === 0) {
      console.log(pc.yellow('  No files selected.'));
      return;
    }
    selected = selectedNames;
  }

  // Step 3: Pull each file
  const spinner = ora('Pulling...').start();
  let successCount = 0;

  for (const filename of selected) {
    const envKey = buildEnvKey(environment, filename);
    spinner.text = `Pulling ${pc.bold(filename)}...`;

    try {
      const versionNum = options.version ? parseInt(options.version, 10) : undefined;
      const entries = await pullEntriesFromServer(envKey, masterKey, api, versionNum);

      if (entries.length === 0) {
        spinner.stop();
        console.log(pc.yellow(`  Skipping ${filename} — 0 variables (empty or corrupted).`));
        spinner.start();
        continue;
      }

      const output = formatOutput(entries, options.format);

      if (options.stdout) {
        spinner.stop();
        console.log(pc.dim(`\n# ${filename}`));
        process.stdout.write(output);
        spinner.start();
      } else {
        await writeEnvFile(filename, output, true); // auto-overwrite in multi-file mode
        spinner.stop();
        console.log(actionSuccess(
          `${pc.bold(filename)} ${pc.dim('←')} ${pc.dim(`${entries.length} vars`)}`,
        ));
        spinner.start();
      }
      successCount++;
    } catch (error: unknown) {
      spinner.stop();
      if (error instanceof BoltenvError && error.code === 'NO_REMOTE_DATA') {
        console.log(pc.yellow(`  Skipping ${filename} — not found on server.`));
      } else {
        console.log(pc.red(`  Failed to pull ${filename}: ${error instanceof Error ? error.message : 'unknown error'}`));
      }
      spinner.start();
    }
  }

  spinner.stop();

  if (successCount > 0) {
    console.log();
    console.log(actionSuccess(
      `${pc.bold(String(successCount))} file${successCount === 1 ? '' : 's'} ${pc.dim('←')} ${pc.cyan(ctx.repo.fullName)}:${pc.yellow(environment)}`,
    ));
  }

  // Suggest saving file list to config if not present
  if (!config?.files && !options.yes && !options.stdout && successCount > 0) {
    console.log();
    console.log(hint(`Add ${pc.cyan('files:')} to .boltenv.yaml to skip manifest lookups.`));
  }
}

// ---------------------------------------------------------------------------
// Write env file atomically
// ---------------------------------------------------------------------------

async function writeEnvFile(
  file: string,
  content: string,
  autoOverwrite: boolean,
): Promise<void> {
  const outPath = path.resolve(file);

  // Containment check: resolved path must be inside the current working directory.
  // Prevents path traversal even if assertSafeFilename is somehow bypassed.
  const projectRoot = path.resolve(process.cwd());
  if (!outPath.startsWith(projectRoot + path.sep) && outPath !== path.join(projectRoot, file)) {
    throw new BoltenvError(
      `Path escapes project root: "${file}"`,
      'PATH_ESCAPE',
      'The resolved file path is outside the current working directory.',
    );
  }

  if (fs.existsSync(outPath) && !autoOverwrite) {
    const shouldOverwrite = await confirm({
      message: `${file} already exists. Overwrite?`,
      default: true,
    });
    if (!shouldOverwrite) {
      console.log(pc.yellow(`  Skipped ${file}.`));
      return;
    }
  }

  // Ensure parent directory exists — but only within project root
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Atomic write: random temp suffix (not PID — PIDs recycle fast)
  const suffix = crypto.randomBytes(8).toString('hex');
  const tmpPath = outPath + `.tmp.${suffix}`;
  try {
    fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, outPath);
    // Ensure mode is correct after rename (some FS/NFS preserve old target mode)
    fs.chmodSync(outPath, 0o600);
  } catch (error: unknown) {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

/** Only alphanumeric + underscore, starting with letter or underscore */
const VALID_SHELL_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

function formatOutput(entries: ReadonlyArray<EnvEntry>, format: string): string {
  switch (format) {
    case 'json':
      return JSON.stringify(
        Object.fromEntries(entries.map((e) => [e.key, e.value])),
        null,
        2,
      ) + '\n';
    case 'shell':
      // Defense-in-depth: validate key names before interpolating into shell export statements.
      // parseEnvFile already enforces this, but shell output may be eval'd by users.
      return entries
        .filter((e) => VALID_SHELL_KEY.test(e.key))
        .map((e) => `export ${e.key}=${quoteShell(e.value)}`)
        .join('\n') + '\n';
    case 'dotenv':
      return serializeEnvFile(entries);
    default:
      throw Errors.invalidFormat(format);
  }
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
