import type { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';
import { login, saveToken, loadToken } from '../core/auth.js';
import { header, hint } from '../utils/branding.js';

export function registerLogin(program: Command): void {
  program
    .command('login')
    .description('Authenticate with GitHub (one-time setup)')
    .option('--force', 'Re-authenticate even if already logged in', false)
    .action(async (options: { force: boolean }) => {
      const existing = loadToken();
      if (existing && !options.force) {
        console.log(header(`Logged in as ${pc.bold(existing.gitHubUser)}`));
        console.log(pc.dim('  Use --force to re-authenticate.'));
        return;
      }

      console.log(header('GitHub Authentication'));
      const spinner = ora();

      const auth = await login({
        onDeviceCode(userCode, verificationUri) {
          spinner.stop();
          console.log(`  Open ${pc.cyan(verificationUri)}`);
          console.log(`  Code: ${pc.bold(pc.green(userCode))}`);
        },
        onPolling() {
          spinner.start('Waiting for authorization...');
        },
        onAuthenticated(user) {
          spinner.succeed(`Authenticated as ${pc.bold(user)}`);
        },
      });

      saveToken(auth);
      console.log(hint(`Run ${pc.cyan('boltenv push')} to upload your .env`));
    });
}
