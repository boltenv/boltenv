import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { checkbox, confirm, select } from '@inquirer/prompts';
import ora from 'ora';
import pc from 'picocolors';
import { loadCommandContext, getActorName, requireWriteAccess } from './shared.js';
import { parseEnvFile, serializeEnvFile } from '../core/env-file.js';
import { encrypt, deriveEncryptionKey, generateMasterKey, keyFingerprint } from '../core/crypto.js';
import { loadRepoKey, saveRepoKey } from '../core/key-store.js';
import { createApiClient } from '../core/api-client.js';
import { parseTtl, formatTtl } from '../core/ttl.js';
import { loadProjectConfig } from '../core/config.js';
import { discoverEnvFiles, secretFiles, templateFiles } from '../core/env-discovery.js';
import { discoverComposeEnvFiles } from '../core/compose-discovery.js';
import { buildEnvKey, buildManifestKey, filesToManifestEntries, assertSafeFilename } from '../core/env-namespacing.js';
import { tryPullManifest } from '../core/env-resolver.js';
import { Errors } from '../utils/errors.js';
import { actionSuccess, hint } from '../utils/branding.js';
import type { EncryptedBlob, EnvEntry } from '../types/index.js';
import type { ApiClient } from '../core/api-client.js';

const TTL_CHOICES = [
  { name: 'Permanent (no expiry)', value: 'permanent' },
  { name: '90 days', value: '90d' },
  { name: '30 days', value: '30d' },
  { name: '7 days', value: '7d' },
  { name: '24 hours', value: '24h' },
  { name: '1 hour', value: '1h' },
] as const;

async function promptTtl(): Promise<number | undefined> {
  const chosen = await select({
    message: 'How long should this be available?',
    choices: [...TTL_CHOICES],
    default: 'permanent',
  });
  return chosen === 'permanent' ? undefined : parseTtl(chosen);
}

function maskValue(value: string): string {
  if (value.length === 0) return '(empty)';
  if (value.length <= 4) return '****';
  return value.slice(0, 2) + '****' + value.slice(-2);
}

interface PushOptions {
  readonly env?: string;
  readonly repo?: string;
  readonly ttl?: string;
  readonly select: boolean;
  readonly yes: boolean;
}

export function registerPush(program: Command): void {
  program
    .command('push')
    .description('Encrypt and upload .env files to shared storage')
    .argument('[file]', 'Path to .env file (omit to auto-discover all env files)')
    .option('-e, --env <environment>', 'Target environment (default: from .boltenv.yaml or "development")')
    .option('-r, --repo <owner/repo>', 'Target repo (default: auto-detect from git)')
    .option('-t, --ttl <ttl>', 'Time-to-live (e.g., 7d, 24h, permanent)')
    .option('--select', 'Interactively select which keys to push', false)
    .option('-y, --yes', 'Skip confirmation prompts', false)
    .action(async (file: string | undefined, options: PushOptions) => {
      if (file !== undefined) {
        await pushSingleFile(file, options);
      } else {
        await pushDiscovered(options);
      }
    });
}

// ---------------------------------------------------------------------------
// Single-file push (explicit path given)
// ---------------------------------------------------------------------------

async function pushSingleFile(file: string, options: PushOptions): Promise<void> {
  const ctx = loadCommandContext(options.env, options.repo);
  await requireWriteAccess(ctx);
  const environment = ctx.environment;

  const envPath = path.resolve(file);
  if (!fs.existsSync(envPath)) {
    throw Errors.envFileNotFound(envPath);
  }

  const stat = fs.statSync(envPath);
  const MAX_ENV_FILE_SIZE = 1024 * 1024;
  if (stat.size > MAX_ENV_FILE_SIZE) {
    throw Errors.envFileTooLarge(envPath, stat.size);
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const entries = parseEnvFile(content);

  if (entries.length === 0) {
    console.log(pc.yellow('  No variables found in file.'));
    return;
  }

  let selectedEntries: ReadonlyArray<EnvEntry> = entries;
  if (options.select && entries.length > 1) {
    const selectedKeys = await checkbox({
      message: 'Select keys:',
      choices: entries.map((e) => ({
        name: `${e.key}=${maskValue(e.value)}`,
        value: e.key,
        checked: true,
      })),
    });
    selectedEntries = entries.filter((e) => selectedKeys.includes(e.key));
    if (selectedEntries.length === 0) {
      console.log(pc.yellow('  No keys selected.'));
      return;
    }
  }

  let ttlSeconds: number | undefined;
  if (options.ttl) {
    ttlSeconds = options.ttl === 'permanent' ? undefined : parseTtl(options.ttl);
  } else if (!options.yes) {
    ttlSeconds = await promptTtl();
  }

  let masterKey = loadRepoKey(ctx.repo.fullName);
  let isNewKey = false;
  if (!masterKey) {
    masterKey = generateMasterKey();
    saveRepoKey(ctx.repo.fullName, masterKey);
    isNewKey = true;
  }

  // Validate and use namespaced env key so .env.backend → "development::.env.backend"
  const filename = path.basename(file);
  assertSafeFilename(filename);
  const envKey = buildEnvKey(environment, filename);

  const ttlLabel = ttlSeconds !== undefined ? formatTtl(ttlSeconds) : pc.green('permanent');

  if (!options.yes) {
    console.log(`  ${pc.dim('Target')}  ${pc.cyan(ctx.repo.fullName)}:${pc.yellow(envKey)}`);
    console.log(`  ${pc.dim('File')}    ${pc.white(filename)}`);
    console.log(`  ${pc.dim('Keys')}    ${selectedEntries.map((e) => e.key).join(', ')}`);
    console.log(`  ${pc.dim('TTL')}     ${ttlLabel}`);
    console.log(`  ${pc.dim('Key')}     ${pc.dim(keyFingerprint(masterKey))}${isNewKey ? pc.green(' (new)') : ''}`);
    console.log();

    const shouldPush = await confirm({
      message: `Push ${selectedEntries.length} variable${selectedEntries.length === 1 ? '' : 's'} from ${filename}?`,
      default: true,
    });
    if (!shouldPush) {
      console.log(pc.yellow('  Aborted.'));
      return;
    }
  }

  const spinner = ora(`Pushing ${pc.bold(filename)}...`).start();

  const api = createApiClient({
    baseUrl: ctx.apiBaseUrl,
    token: ctx.auth.accessToken,
    repo: ctx.repo.fullName,
  });

  const result = await pushEntriesToServer(selectedEntries, envKey, masterKey, api, ttlSeconds);

  // Sync manifest: add this file to the manifest so teammates can discover it on pull.
  // Pull existing manifest, merge this filename in, push updated manifest.
  if (filename !== '.env') {
    spinner.text = 'Syncing manifest...';
    await syncManifestWithFile(filename, environment, masterKey, api, ttlSeconds);
  }

  spinner.stop();

  const ttlStr = ttlSeconds !== undefined ? formatTtl(ttlSeconds) : pc.green('permanent');
  console.log(actionSuccess(
    `${pc.bold(filename)} ${pc.dim('→')} ${pc.cyan(ctx.repo.fullName)}:${pc.yellow(envKey)} v${result.version} (${ttlStr})`,
  ));

  if (isNewKey) {
    console.log(hint(`New encryption key generated. Share with teammates: ${pc.cyan('boltenv key export')}`));
  }
}

// ---------------------------------------------------------------------------
// Multi-file push (auto-discover)
// ---------------------------------------------------------------------------

async function pushDiscovered(options: PushOptions): Promise<void> {
  const config = loadProjectConfig();

  // Step 1: Find files — config-specified OR auto-discovered
  let filesToPush: ReadonlyArray<{ filename: string; absolutePath: string; varCount: number }>;

  if (config?.files && config.files.length > 0) {
    // Use config-specified files
    const resolved: { filename: string; absolutePath: string; varCount: number }[] = [];
    for (const f of config.files) {
      const abs = path.resolve(f);
      if (!fs.existsSync(abs)) {
        console.log(pc.yellow(`  Warning: ${f} (from .boltenv.yaml) not found, skipping.`));
        continue;
      }
      const content = fs.readFileSync(abs, 'utf8');
      const parsed = parseEnvFile(content);
      resolved.push({ filename: f, absolutePath: abs, varCount: parsed.length });
    }
    filesToPush = resolved;
  } else {
    // Auto-discover: check docker-compose.yml first, then filesystem scan
    const composeFiles = discoverComposeEnvFiles();
    if (composeFiles.length > 0) {
      console.log(pc.dim(`  Detected docker-compose env_file paths`));
      const resolved: { filename: string; absolutePath: string; varCount: number }[] = [];
      for (const cf of composeFiles) {
        const abs = path.resolve(cf.envFilePath);
        if (!fs.existsSync(abs)) {
          console.log(pc.yellow(`  Warning: ${cf.envFilePath} (from docker-compose, service: ${cf.service}) not found`));
          continue;
        }
        // Deduplicate (multiple services can share the same env file)
        if (resolved.some((r) => r.absolutePath === abs)) continue;
        const content = fs.readFileSync(abs, 'utf8');
        const parsed = parseEnvFile(content);
        resolved.push({ filename: cf.envFilePath, absolutePath: abs, varCount: parsed.length });
      }
      filesToPush = resolved;
    } else {
      // Filesystem scan
      const discovered = discoverEnvFiles();
      const secrets = secretFiles(discovered);
      const templates = templateFiles(discovered);

      if (templates.length > 0) {
        console.log(pc.dim(`  Skipping template files: ${templates.map((t) => t.filename).join(', ')}`));
      }

      filesToPush = secrets;
    }
  }

  if (filesToPush.length === 0) {
    throw Errors.noEnvFilesFound();
  }

  // Step 2: If only one file, push it directly
  if (filesToPush.length === 1) {
    await pushSingleFile(filesToPush[0]!.filename, options);
    return;
  }

  // Step 3: Show discovered files and let user select
  console.log(`\n  ${pc.yellow('⚡')} Found ${pc.bold(String(filesToPush.length))} env files:\n`);
  for (const f of filesToPush) {
    console.log(`     ${pc.white(f.filename.padEnd(24))} ${pc.dim(`${f.varCount} vars`)}`);
  }
  console.log();

  let selected: ReadonlyArray<{ filename: string; absolutePath: string; varCount: number }>;

  if (options.yes) {
    selected = filesToPush;
  } else {
    const selectedNames = await checkbox({
      message: 'Select files to push:',
      choices: filesToPush.map((f) => ({
        name: `${f.filename}  ${pc.dim(`(${f.varCount} vars)`)}`,
        value: f.filename,
        checked: true,
      })),
    });

    if (selectedNames.length === 0) {
      console.log(pc.yellow('  No files selected.'));
      return;
    }

    selected = filesToPush.filter((f) => selectedNames.includes(f.filename));
  }

  // Step 4: Prepare context and key (once for all files)
  const ctx = loadCommandContext(options.env, options.repo);
  await requireWriteAccess(ctx);
  const environment = ctx.environment;

  let masterKey = loadRepoKey(ctx.repo.fullName);
  let isNewKey = false;
  if (!masterKey) {
    masterKey = generateMasterKey();
    saveRepoKey(ctx.repo.fullName, masterKey);
    isNewKey = true;
  }

  let ttlSeconds: number | undefined;
  if (options.ttl) {
    ttlSeconds = options.ttl === 'permanent' ? undefined : parseTtl(options.ttl);
  } else if (!options.yes) {
    ttlSeconds = await promptTtl();
  }

  const api = createApiClient({
    baseUrl: ctx.apiBaseUrl,
    token: ctx.auth.accessToken,
    repo: ctx.repo.fullName,
  });

  const ttlLabel = ttlSeconds !== undefined ? formatTtl(ttlSeconds) : pc.green('permanent');

  // Step 5: Confirm
  if (!options.yes) {
    console.log();
    console.log(`  ${pc.dim('Target')}  ${pc.cyan(ctx.repo.fullName)}:${pc.yellow(environment)}`);
    console.log(`  ${pc.dim('Files')}   ${selected.map((f) => f.filename).join(', ')}`);
    console.log(`  ${pc.dim('TTL')}     ${ttlLabel}`);
    console.log(`  ${pc.dim('Key')}     ${pc.dim(keyFingerprint(masterKey))}${isNewKey ? pc.green(' (new)') : ''}`);
    console.log();

    const shouldPush = await confirm({
      message: `Push ${selected.length} file${selected.length === 1 ? '' : 's'}?`,
      default: true,
    });
    if (!shouldPush) {
      console.log(pc.yellow('  Aborted.'));
      return;
    }
  }

  // Step 6: Push each file
  const spinner = ora('Pushing...').start();

  for (const file of selected) {
    const content = fs.readFileSync(file.absolutePath, 'utf8');
    let entries = parseEnvFile(content);

    if (options.select && entries.length > 1) {
      spinner.stop();
      const selectedKeys = await checkbox({
        message: `Select keys from ${file.filename}:`,
        choices: entries.map((e) => ({
          name: `${e.key}=${maskValue(e.value)}`,
          value: e.key,
          checked: true,
        })),
      });
      entries = entries.filter((e) => selectedKeys.includes(e.key));
      spinner.start(`Pushing ${pc.bold(file.filename)}...`);
    } else {
      spinner.text = `Pushing ${pc.bold(file.filename)}...`;
    }

    if (entries.length === 0) {
      spinner.stop();
      console.log(pc.yellow(`  Skipping ${file.filename} (no variables).`));
      spinner.start();
      continue;
    }

    const envKey = buildEnvKey(environment, file.filename);
    const result = await pushEntriesToServer(entries, envKey, masterKey, api, ttlSeconds);

    spinner.stop();
    console.log(actionSuccess(
      `${pc.bold(file.filename)} ${pc.dim('→')} ${pc.yellow(envKey)} v${result.version} ${pc.dim(`(${entries.length} vars)`)}`,
    ));
    spinner.start();
  }

  // Step 7: Push manifest (list of files for pull discovery)
  spinner.text = 'Saving file manifest...';
  const manifestEntries = filesToManifestEntries(selected.map((f) => f.filename));
  const manifestKey = buildManifestKey(environment);
  await pushEntriesToServer(manifestEntries, manifestKey, masterKey, api, ttlSeconds);

  spinner.stop();

  console.log();
  const ttlStr = ttlSeconds !== undefined ? formatTtl(ttlSeconds) : pc.green('permanent');
  console.log(actionSuccess(
    `${pc.bold(String(selected.length))} files ${pc.dim('→')} ${pc.cyan(ctx.repo.fullName)}:${pc.yellow(environment)} (${ttlStr})`,
  ));

  if (isNewKey) {
    console.log(hint(`New encryption key generated. Share with teammates: ${pc.cyan('boltenv key export')}`));
  }

  // Step 8: Offer to save file list to config
  if (!config?.files && !options.yes) {
    console.log();
    const shouldSave = await confirm({
      message: 'Save file list to .boltenv.yaml so teammates know which files to pull?',
      default: true,
    });
    if (shouldSave) {
      saveFilesToConfig(selected.map((f) => f.filename));
      console.log(actionSuccess(`Saved to ${pc.cyan('.boltenv.yaml')} — commit this file so your team has the same setup.`));
    }
  }
}

// ---------------------------------------------------------------------------
// Core push helper (encrypt + upload one set of entries)
// ---------------------------------------------------------------------------

async function pushEntriesToServer(
  entries: ReadonlyArray<EnvEntry>,
  envKey: string,
  masterKey: Buffer,
  api: ApiClient,
  ttlSeconds?: number,
): Promise<{ version: number }> {
  const encKey = deriveEncryptionKey(masterKey);
  const contentToEncrypt = serializeEnvFile(entries);
  const envelope = encrypt(contentToEncrypt, encKey);

  const blob: EncryptedBlob = {
    version: 1,
    envelope,
    encryptedAt: new Date().toISOString(),
    pushedBy: getActorName(),
    environment: envKey,
  };

  return api.push({
    blob,
    keyFingerprint: keyFingerprint(masterKey),
    environment: envKey,
    ttlSeconds,
    keys: entries.map((e) => e.key),
  });
}

// ---------------------------------------------------------------------------
// Manifest sync: ensure single-file push updates the manifest
// ---------------------------------------------------------------------------

async function syncManifestWithFile(
  filename: string,
  environment: string,
  masterKey: Buffer,
  api: ApiClient,
  ttlSeconds?: number,
): Promise<void> {
  // Pull existing manifest (may not exist yet)
  const existing = await tryPullManifest(environment, masterKey, api);
  const currentFiles = existing ? [...existing] : [];

  // Add this file if not already in manifest
  if (!currentFiles.includes(filename)) {
    currentFiles.push(filename);
  }

  // Push updated manifest
  const manifestEntries = filesToManifestEntries(currentFiles);
  const manifestKey = buildManifestKey(environment);
  await pushEntriesToServer(manifestEntries, manifestKey, masterKey, api, ttlSeconds);
}

// ---------------------------------------------------------------------------
// Save discovered files to .boltenv.yaml
// ---------------------------------------------------------------------------

function saveFilesToConfig(filenames: ReadonlyArray<string>): void {
  const configPath = path.resolve('.boltenv.yaml');
  let content = '';

  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch {
    // No config yet — create minimal one
    content = 'version: 2\n';
  }

  // Append files section if not present
  if (!content.includes('files:')) {
    const filesYaml = 'files:\n' + filenames.map((f) => `  - ${f}`).join('\n') + '\n';
    content = content.trimEnd() + '\n\n' + filesYaml;
    fs.writeFileSync(configPath, content, 'utf8');
  }
}
