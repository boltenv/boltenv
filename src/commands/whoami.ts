import type { Command } from 'commander';
import pc from 'picocolors';
import { loadToken } from '../core/auth.js';
import { detectRepo } from '../core/git.js';
import { loadProjectConfig } from '../core/config.js';
import { DEFAULT_ENVIRONMENT } from '../constants.js';
import { header } from '../utils/branding.js';
import { getActorName } from './shared.js';

export function registerWhoami(program: Command): void {
  program
    .command('whoami')
    .description('Show GitHub user, detected repo, and environment')
    .action(() => {
      const auth = loadToken();

      if (!auth) {
        console.log(header('Not logged in'));
        console.log(`  Run ${pc.cyan('boltenv login')}`);
        return;
      }

      let repoStr = pc.dim('(not in a git repo)');
      try { repoStr = pc.cyan(detectRepo().fullName); } catch { /* ok */ }

      const config = loadProjectConfig();
      const environment = config?.defaultEnvironment ?? DEFAULT_ENVIRONMENT;

      console.log(header(auth.gitHubUser));
      console.log(`  ${pc.dim('Actor')}   ${getActorName()}`);
      console.log(`  ${pc.dim('Repo')}    ${repoStr}`);
      console.log(`  ${pc.dim('Env')}     ${pc.yellow(environment)}`);
    });
}
