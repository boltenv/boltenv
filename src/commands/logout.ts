import type { Command } from 'commander';
import pc from 'picocolors';
import { removeToken } from '../core/auth.js';
import { header } from '../utils/branding.js';

export function registerLogout(program: Command): void {
  program
    .command('logout')
    .description('Remove stored GitHub token')
    .action(() => {
      const removed = removeToken();
      if (removed) {
        console.log(header('Logged out'));
        console.log(pc.dim('  Token removed.'));
      } else {
        console.log(header('Already logged out'));
      }
    });
}
