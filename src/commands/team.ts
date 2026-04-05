import type { Command } from 'commander';
import pc from 'picocolors';
import ora from 'ora';
import { requireAuth } from '../core/auth.js';
import { createApiClient } from '../core/api-client.js';
import { API_BASE_URL, VALID_TEAM_ROLES } from '../constants.js';
import { Errors } from '../utils/errors.js';
import { header, roleBadge, hint } from '../utils/branding.js';
import type { TeamRole } from '../types/index.js';

export function registerTeam(program: Command): void {
  const team = program
    .command('team')
    .description('Manage your boltenv team');

  team
    .command('list')
    .description('List team members')
    .action(async () => {
      const auth = requireAuth();
      const client = createApiClient({
        baseUrl: API_BASE_URL,
        token: auth.accessToken,
      });

      const spinner = ora('Loading...').start();
      const data = await client.teamList();
      spinner.stop();

      if (!data.team) {
        console.log(header('No team'));
        console.log(hint(`${pc.cyan('boltenv team add <user>')} to create one`));
        return;
      }

      console.log(header(`${data.team.name} (${data.members.length})`));
      for (const m of data.members) {
        const date = new Date(m.addedAt).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric',
        });
        console.log(`  ${roleBadge(m.role).padEnd(20)} ${pc.bold(m.githubUser.padEnd(18))} ${pc.dim(date)}`);
      }
    });

  team
    .command('add')
    .description('Add a member to your team')
    .argument('<user>', 'GitHub username')
    .option('--role <role>', 'admin or member', 'member')
    .action(async (user: string, options: { role: string }) => {
      if (!VALID_TEAM_ROLES.includes(options.role as typeof VALID_TEAM_ROLES[number])) {
        throw Errors.invalidRole(options.role);
      }
      const role = options.role as TeamRole;

      const auth = requireAuth();
      const client = createApiClient({ baseUrl: API_BASE_URL, token: auth.accessToken });
      const spinner = ora(`Adding ${user}...`).start();
      const result = await client.teamAdd(user, role);
      spinner.succeed(result.message);
    });

  team
    .command('remove')
    .description('Remove a member from your team')
    .argument('<user>', 'GitHub username')
    .action(async (user: string) => {
      const auth = requireAuth();
      const client = createApiClient({ baseUrl: API_BASE_URL, token: auth.accessToken });
      const spinner = ora(`Removing ${user}...`).start();
      const result = await client.teamRemove(user);
      spinner.succeed(result.message);
    });
}
