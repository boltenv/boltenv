import { execFile } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';
import ora from 'ora';
import { requireAuth } from '../core/auth.js';
import { createApiClient } from '../core/api-client.js';
import { API_BASE_URL } from '../constants.js';
import { createLogger } from '../utils/logger.js';
import { header } from '../utils/branding.js';
import type { PlanTier } from '../types/index.js';

const logger = createLogger();

export function registerUpgrade(program: Command): void {
  program
    .command('upgrade')
    .description('Upgrade your boltenv plan')
    .option('--plan <plan>', 'pro or enterprise', 'pro')
    .action(async (options: { plan: string }) => {
      const auth = requireAuth();
      const plan = options.plan as PlanTier;

      if (plan !== 'pro' && plan !== 'enterprise') {
        logger.error('Invalid plan. Choose "pro" or "enterprise".');
        return;
      }

      const client = createApiClient({ baseUrl: API_BASE_URL, token: auth.accessToken });
      const spinner = ora('Creating checkout...').start();
      const result = await client.billingCheckout(plan);
      spinner.stop();

      openInBrowser(result.url);

      console.log(header('Opening checkout...'));
      console.log(`  ${pc.dim('If it didn\'t open:')} ${pc.cyan(result.url)}`);
    });
}

function openInBrowser(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return;
    }
  } catch {
    return;
  }

  const opener = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';

  execFile(opener, [url], () => { /* ignore */ });
}
