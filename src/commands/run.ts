import { spawn } from 'node:child_process';
import type { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';
import { loadCommandContext, requireRepoAccess } from './shared.js';
import { loadRepoKey } from '../core/key-store.js';
import { createApiClient } from '../core/api-client.js';
import { pullAllEntries } from '../core/env-resolver.js';
import { Errors } from '../utils/errors.js';

export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Run a command with injected environment variables')
    .option('-e, --env <environment>', 'Source environment')
    .option('-r, --repo <owner/repo>', 'Target repo (default: auto-detect from git)')
    .option('--override', 'Override existing process env vars', false)
    .allowUnknownOption(true)
    .argument('<command...>', 'Command to run (use -- before the command)')
    .action(async (args: string[], options: {
      env?: string;
      repo?: string;
      override: boolean;
    }) => {
      // Validate command args before doing any network I/O
      const [cmd, ...cmdArgs] = args;
      if (!cmd) {
        console.error(pc.red('  No command specified.'));
        process.exit(1);
      }

      const ctx = loadCommandContext(options.env, options.repo);
      await requireRepoAccess(ctx);

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
      console.log(`  ${pc.green('✓')} Loaded ${pc.bold(String(entries.length))} vars`);

      // Merge env vars — filter out undefined values
      const mergedEnv: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
      );
      for (const entry of entries) {
        if (options.override || !(entry.key in mergedEnv)) {
          mergedEnv[entry.key] = entry.value;
        }
      }

      // Spawn subprocess (no shell — args are passed directly)
      const child = spawn(cmd, cmdArgs, {
        env: mergedEnv,
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      const forwardSignal = (signal: NodeJS.Signals): void => {
        child.kill(signal);
      };
      process.on('SIGINT', forwardSignal);
      process.on('SIGTERM', forwardSignal);

      child.on('error', (err) => {
        process.removeListener('SIGINT', forwardSignal);
        process.removeListener('SIGTERM', forwardSignal);
        console.error(pc.red(`  Failed to start "${cmd}": ${err.message}`));
        process.exit(127);
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
