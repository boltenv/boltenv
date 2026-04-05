import type { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';
import { loadCommandContext, requireRepoAccess } from './shared.js';
import { loadRepoKey } from '../core/key-store.js';
import { createApiClient } from '../core/api-client.js';
import { buildEnvKey } from '../core/env-namespacing.js';
import { resolveFileList } from '../core/env-resolver.js';
import { formatTtl } from '../core/ttl.js';
import { header } from '../utils/branding.js';
import { BoltenvError } from '../utils/errors.js';

/**
 * Format an ISO 8601 timestamp into a human-readable relative time.
 */
function timeAgo(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (Number.isNaN(then)) return isoDate;

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const date = new Date(isoDate);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Shorten the "user@hostname" actor string.
 */
function shortActor(actor: string): string {
  const atIdx = actor.indexOf('@');
  if (atIdx === -1) return actor;
  return actor.slice(0, atIdx);
}

export function registerLs(program: Command): void {
  program
    .command('ls')
    .description('Show metadata and version history for stored environment')
    .option('-e, --env <environment>', 'Target environment')
    .option('-r, --repo <owner/repo>', 'Target repo (default: auto-detect from git)')
    .action(async (options: { env?: string; repo?: string }) => {
      const ctx = loadCommandContext(options.env, options.repo);
      await requireRepoAccess(ctx);

      const masterKey = loadRepoKey(ctx.repo.fullName);
      const api = createApiClient({
        baseUrl: ctx.apiBaseUrl,
        token: ctx.auth.accessToken,
        repo: ctx.repo.fullName,
      });

      // Resolve the file list to show all tracked files
      let fileList: ReadonlyArray<string> = ['.env'];
      if (masterKey) {
        const spinner = ora('Resolving files...').start();
        fileList = await resolveFileList(ctx.environment, masterKey, api);
        spinner.stop();
      }

      // Header
      console.log();
      console.log(header(`${ctx.repo.fullName}:${pc.yellow(ctx.environment)}`));

      if (fileList.length > 1) {
        console.log(`  ${pc.dim('Files')}   ${fileList.join(', ')}`);
      }
      console.log();

      // Show info for each file
      for (const filename of fileList) {
        const envKey = buildEnvKey(ctx.environment, filename);
        const spinner = ora(`Fetching ${filename}...`).start();

        try {
          const result = await api.ls({ environment: envKey });
          spinner.stop();

          const ttl = result.ttlRemaining !== null
            ? pc.yellow(formatTtl(result.ttlRemaining))
            : pc.green('permanent');

          // File header (only show if multi-file)
          if (fileList.length > 1) {
            console.log(`  ${pc.white(pc.bold(filename))}`);
          }

          const latestPusher = shortActor(result.metadata.pushedBy);
          const latestTime = timeAgo(result.metadata.encryptedAt);
          console.log(`  ${pc.dim('Keys')}    ${pc.white(String(result.metadata.keyCount))}`);
          console.log(`  ${pc.dim('TTL')}     ${ttl}`);
          console.log(`  ${pc.dim('Latest')}  ${pc.white(latestPusher)} pushed ${pc.dim(latestTime)}`);

          if (result.versions.length > 0) {
            console.log();
            for (const v of result.versions) {
              const isCurrent = v.version === result.versions[0]!.version;
              const marker = isCurrent ? pc.green('●') : pc.dim('○');
              const vLabel = isCurrent
                ? pc.green(`v${v.version}`)
                : pc.dim(`v${v.version}`);
              const keys = pc.white(`${v.keyCount} keys`);
              const who = pc.cyan(shortActor(v.pushedBy));
              const when = pc.dim(timeAgo(v.encryptedAt));

              console.log(`   ${marker} ${vLabel.padEnd(18)} ${keys.padEnd(20)} ${who.padEnd(20)} ${when}`);
            }
          }

          console.log();
        } catch (error: unknown) {
          spinner.stop();
          if (error instanceof BoltenvError && error.code === 'NO_REMOTE_DATA') {
            if (fileList.length > 1) {
              console.log(`  ${pc.dim(filename)}  ${pc.yellow('not pushed yet')}`);
            } else {
              console.log(`  ${pc.yellow('No data pushed yet for this environment.')}`);
            }
            console.log();
          } else {
            throw error;
          }
        }
      }
    });
}
