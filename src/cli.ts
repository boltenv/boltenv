import { Command } from 'commander';
import pc from 'picocolors';
import { registerInit } from './commands/init.js';
import { registerKey } from './commands/key.js';
import { registerLogin } from './commands/login.js';
import { registerLogout } from './commands/logout.js';
import { registerPush } from './commands/push.js';
import { registerPull } from './commands/pull.js';
import { registerRun } from './commands/run.js';
import { registerDev } from './commands/dev.js';
import { registerLs } from './commands/ls.js';
import { registerWhoami } from './commands/whoami.js';
import { registerAccount } from './commands/account.js';
import { registerTeam } from './commands/team.js';
import { registerUpgrade } from './commands/upgrade.js';
import { registerSearch } from './commands/search.js';
import { registerDoctor } from './commands/doctor.js';
import { getFeatureFlags } from './core/feature-flags.js';
import { printLogo } from './utils/branding.js';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
export const CLI_VERSION = pkg.version;

export async function createProgram(): Promise<Command> {
  const program = new Command();
  const flags = await getFeatureFlags();

  program
    .name('boltenv')
    .description('AirDrop for .env files — push/pull env vars via GitHub repo access')
    .version(CLI_VERSION)
    .action(() => {
      printLogo();
      console.log('');
      console.log(pc.dim('  Setup'));
      console.log(`    ${pc.yellow('boltenv init')}       Initialize project config`);
      console.log(`    ${pc.yellow('boltenv login')}      Auth with GitHub`);
      console.log('');
      if (flags.push || flags.pull) {
        console.log(pc.dim('  Sync'));
        if (flags.push) console.log(`    ${pc.yellow('boltenv push')}       Encrypt & upload env files`);
        if (flags.pull) console.log(`    ${pc.yellow('boltenv pull')}       Download & decrypt env files`);
        console.log(`    ${pc.yellow('boltenv ls')}         List versions & metadata`);
        if (flags.search) console.log(`    ${pc.yellow('boltenv search')}     Find keys across env files`);
        console.log('');
      }
      if (flags.dev || flags.run) {
        console.log(pc.dim('  Run'));
        if (flags.dev) console.log(`    ${pc.yellow('boltenv dev')}        Pull env & start dev server`);
        if (flags.run) console.log(`    ${pc.yellow('boltenv run')}        Run command with injected env`);
        console.log('');
      }
      console.log(pc.dim('  Keys'));
      console.log(`    ${pc.yellow('boltenv key export')}  Share encryption key with team`);
      console.log(`    ${pc.yellow('boltenv key import')}  Import key from teammate`);
      console.log(`    ${pc.yellow('boltenv key status')}  Check if you have the key`);
      console.log('');
      console.log(pc.dim('  Account'));
      console.log(`    ${pc.yellow('boltenv account')}    View plan & usage`);
      if (flags.teams) console.log(`    ${pc.yellow('boltenv team')}       Manage team members`);
      if (flags.upgrade) console.log(`    ${pc.yellow('boltenv upgrade')}    Upgrade plan`);
      console.log(`    ${pc.yellow('boltenv whoami')}     Show current context`);
      console.log(`    ${pc.yellow('boltenv doctor')}     Diagnose setup & auth issues`);
      console.log('');
      console.log(pc.dim(`  Run boltenv <cmd> --help for details`));
      console.log('');
    });

  // Always registered (core, can't be disabled)
  registerInit(program);
  registerKey(program);
  registerLogin(program);
  registerLogout(program);
  registerLs(program);
  registerWhoami(program);
  registerAccount(program);
  registerDoctor(program);

  // Conditionally registered based on feature flags
  if (flags.push) registerPush(program);
  if (flags.pull) registerPull(program);
  if (flags.dev) registerDev(program);
  if (flags.run) registerRun(program);
  if (flags.search) registerSearch(program);
  if (flags.teams) registerTeam(program);
  if (flags.upgrade) registerUpgrade(program);

  return program;
}
