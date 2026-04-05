import type { Command } from 'commander';
import pc from 'picocolors';
import ora from 'ora';
import { requireAuth } from '../core/auth.js';
import { createApiClient } from '../core/api-client.js';
import { API_BASE_URL } from '../constants.js';
import { header, planBadge, usageBar, hint } from '../utils/branding.js';

export function registerAccount(program: Command): void {
  program
    .command('account')
    .description('Show your boltenv account, plan, and usage')
    .action(async () => {
      const auth = requireAuth();
      const client = createApiClient({
        baseUrl: API_BASE_URL,
        token: auth.accessToken,
      });

      const spinner = ora('Loading...').start();
      const acct = await client.account();
      spinner.stop();

      const since = new Date(acct.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

      console.log(header(acct.user));
      console.log(`  ${pc.dim('Plan')}    ${planBadge(acct.plan)}  ${pc.dim('since')} ${since}`);
      console.log(`  ${pc.dim('Pushes')}  ${usageBar(acct.usage.pushes, acct.usage.pushLimit)}`);
      console.log(`  ${pc.dim('Pulls')}   ${usageBar(acct.usage.pulls, acct.usage.pullLimit)}`);
      console.log(`  ${pc.dim('Repos')}   ${usageBar(acct.usage.repos, acct.usage.repoLimit)}`);

      if (acct.plan === 'free') {
        console.log(hint(`${pc.cyan('boltenv upgrade')} to unlock Pro`));
      }
    });
}
