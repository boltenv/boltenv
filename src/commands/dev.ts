import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';
import { loadCommandContext, requireRepoAccess } from './shared.js';
import { loadRepoKey } from '../core/key-store.js';
import { createApiClient } from '../core/api-client.js';
import { loadProjectConfig } from '../core/config.js';
import { pullAllEntries } from '../core/env-resolver.js';
import { Errors } from '../utils/errors.js';

export function registerDev(program: Command): void {
  program
    .command('dev')
    .description('Pull env vars and run your dev server (configurable in .boltenv.yaml)')
    .option('-e, --env <environment>', 'Source environment')
    .option('-r, --repo <owner/repo>', 'Target repo (default: auto-detect from git)')
    .option('--override', 'Override existing process env vars', false)
    .argument('[script]', 'Script name from .boltenv.yaml scripts, or a command to run', 'dev')
    .action(async (script: string, options: {
      env?: string;
      repo?: string;
      override: boolean;
    }) => {
      const ctx = loadCommandContext(options.env, options.repo);
      await requireRepoAccess(ctx);
      const config = loadProjectConfig();

      // Resolve the command to run
      const command = config?.scripts?.[script] ?? resolveDefaultCommand(script);
      if (!command.trim()) {
        throw Errors.devCommandEmpty();
      }

      console.log(`  ${pc.dim('env')}     ${pc.yellow(ctx.environment)}`);
      console.log(`  ${pc.dim('cmd')}     ${pc.cyan(command)}`);
      console.log();

      // Load local key
      const masterKey = loadRepoKey(ctx.repo.fullName);
      if (!masterKey) {
        throw Errors.keyNotFound(ctx.repo.fullName);
      }

      const spinner = ora('Loading environment...').start();

      const api = createApiClient({
        baseUrl: ctx.apiBaseUrl,
        token: ctx.auth.accessToken,
        repo: ctx.repo.fullName,
      });

      // Pull ALL files (config/manifest/fallback) and merge vars
      const { entries, files } = await pullAllEntries(ctx.environment, masterKey, api);

      spinner.stop();

      if (files.length > 1) {
        for (const f of files) {
          console.log(`  ${pc.green('✓')} ${pc.dim(f.filename)} ${pc.dim(`(${f.entries.length} vars)`)}`);
        }
      }
      console.log(`  ${pc.green('✓')} Loaded ${pc.bold(String(entries.length))} vars → running ${pc.cyan(command)}`);
      console.log();

      // Merge env vars — filter out undefined values from process.env
      const mergedEnv: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
      );
      for (const entry of entries) {
        if (options.override || !(entry.key in mergedEnv)) {
          mergedEnv[entry.key] = entry.value;
        }
      }

      // Spawn using shell so npm/pnpm/bun scripts work.
      // The command comes from .boltenv.yaml (project-controlled) or resolveDefaultCommand
      // which only prepends "npm run". User CLI args are not interpolated into the shell string.
      const child = spawn(command, {
        env: mergedEnv,
        stdio: 'inherit',
        cwd: process.cwd(),
        shell: true,
      });

      const forwardSignal = (signal: NodeJS.Signals): void => {
        child.kill(signal);
      };
      process.on('SIGINT', forwardSignal);
      process.on('SIGTERM', forwardSignal);

      child.on('error', (err) => {
        process.removeListener('SIGINT', forwardSignal);
        process.removeListener('SIGTERM', forwardSignal);
        console.error(pc.red(`  Failed to start: ${err.message}`));
        process.exit(1);
      });

      child.on('exit', (code, signal) => {
        process.removeListener('SIGINT', forwardSignal);
        process.removeListener('SIGTERM', forwardSignal);
        if (signal) {
          process.exit(128);
        }
        process.exit(code ?? 1);
      });
    });
}

/**
 * If no scripts config, map common script names to npm run commands.
 */
function resolveDefaultCommand(script: string): string {
  if (script.includes(' ')) return script;
  return `npm run ${script}`;
}
