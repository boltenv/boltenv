import type { Command } from 'commander';
import pc from 'picocolors';
import { loadCommandContext } from './shared.js';
import { exportRepoKey, importRepoKey, hasRepoKey } from '../core/key-store.js';
import { keyFingerprint } from '../core/crypto.js';
import { loadRepoKey } from '../core/key-store.js';
import { header, actionSuccess, hint } from '../utils/branding.js';

export function registerKey(program: Command): void {
  const key = program
    .command('key')
    .description('Manage encryption keys for a repo');

  key
    .command('export')
    .description('Print the repo encryption key (share securely with teammates)')
    .option('-r, --repo <owner/repo>', 'Target repo (default: auto-detect from git)')
    .action((options: { repo?: string }) => {
      const ctx = loadCommandContext(undefined, options.repo);
      const base64Key = exportRepoKey(ctx.repo.fullName);
      const masterKey = loadRepoKey(ctx.repo.fullName);

      console.log(header(`Key for ${ctx.repo.fullName}`));
      console.log();
      console.log(`  ${base64Key}`);
      console.log();
      console.log(`  ${pc.dim('Fingerprint:')} ${keyFingerprint(masterKey!)}`);
      console.log();
      console.log(pc.yellow('  ⚠ This key decrypts all env vars for this repo.'));
      console.log(pc.yellow('  ⚠ Share only via secure channel (DM, 1Password, etc).'));
      console.log(pc.yellow('  ⚠ Never commit or post publicly.'));
      console.log();
      console.log(hint(`Teammate runs: ${pc.cyan(`boltenv key import ${base64Key.slice(0, 8)}...`)}`));
    });

  key
    .command('import')
    .description('Import a repo encryption key from a teammate')
    .argument('<base64-key>', 'The base64 key string from "boltenv key export"')
    .option('-r, --repo <owner/repo>', 'Target repo (default: auto-detect from git)')
    .option('-f, --force', 'Overwrite existing key without prompting', false)
    .action((base64Key: string, options: { repo?: string; force: boolean }) => {
      const ctx = loadCommandContext(undefined, options.repo);

      if (hasRepoKey(ctx.repo.fullName) && !options.force) {
        const existing = loadRepoKey(ctx.repo.fullName);
        console.log(pc.yellow(`  Key already exists for ${ctx.repo.fullName}`));
        console.log(`  ${pc.dim('Current fingerprint:')} ${keyFingerprint(existing!)}`);
        console.log();
        console.log(hint(`Use ${pc.cyan('--force')} to overwrite.`));
        return;
      }

      importRepoKey(ctx.repo.fullName, base64Key);

      const imported = loadRepoKey(ctx.repo.fullName);
      console.log(actionSuccess(`Key imported for ${pc.cyan(ctx.repo.fullName)}`));
      console.log(`  ${pc.dim('Fingerprint:')} ${keyFingerprint(imported!)}`);
      console.log();
      console.log(hint(`Run ${pc.cyan('boltenv pull')} to download your team's env vars.`));
    });

  key
    .command('status')
    .description('Check if you have the encryption key for a repo')
    .option('-r, --repo <owner/repo>', 'Target repo (default: auto-detect from git)')
    .action((options: { repo?: string }) => {
      const ctx = loadCommandContext(undefined, options.repo);

      if (hasRepoKey(ctx.repo.fullName)) {
        const masterKey = loadRepoKey(ctx.repo.fullName);
        console.log(actionSuccess(`Key found for ${pc.cyan(ctx.repo.fullName)}`));
        console.log(`  ${pc.dim('Fingerprint:')} ${keyFingerprint(masterKey!)}`);
      } else {
        console.log(pc.yellow(`  No key for ${ctx.repo.fullName}`));
        console.log(hint(`Get one from a teammate: ${pc.cyan('boltenv key import <key>')}`));
      }
    });
}
