import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { confirm, input, checkbox } from '@inquirer/prompts';
import { stringify as yamlStringify } from 'yaml';
import pc from 'picocolors';
import { CONFIG_FILENAMES, DEFAULT_ENVIRONMENT } from '../constants.js';
import { detectRepo, detectBranch } from '../core/git.js';
import { discoverEnvFiles, secretFiles, templateFiles } from '../core/env-discovery.js';
import { discoverComposeEnvFiles, hasComposeFile } from '../core/compose-discovery.js';
import { analyzeProject, type ProjectAnalysis } from '../core/project-analyzer.js';
import { header, actionSuccess, hint } from '../utils/branding.js';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize boltenv in the current project')
    .option('-y, --yes', 'Use defaults without prompting', false)
    .action(async (options: { yes: boolean }) => {
      console.log(header('Initialize boltenv'));

      // Check if config already exists
      const existingConfig = CONFIG_FILENAMES
        .map((f) => path.resolve(f))
        .find((f) => fs.existsSync(f));

      if (existingConfig) {
        console.log(pc.yellow(`  Config already exists: ${path.basename(existingConfig)}`));
        if (!options.yes) {
          const overwrite = await confirm({
            message: 'Overwrite existing config?',
            default: false,
          });
          if (!overwrite) {
            console.log(pc.dim('  Aborted.'));
            return;
          }
        }
      }

      // Detect repo context
      let repoName = '';
      let branchName = '';
      try {
        const repo = detectRepo();
        repoName = repo.fullName;
      } catch { /* not in a repo */ }

      try {
        branchName = detectBranch();
      } catch { /* no branch */ }

      // Analyze project
      const analysis = analyzeProject();

      // Show project analysis
      console.log();
      if (repoName) {
        console.log(`  ${pc.dim('Repo')}        ${pc.cyan(repoName)}`);
      }
      if (branchName) {
        console.log(`  ${pc.dim('Branch')}      ${pc.yellow(branchName)}`);
      }
      if (analysis.framework !== 'unknown') {
        console.log(`  ${pc.dim('Framework')}   ${pc.white(analysis.framework)}`);
      }
      if (analysis.packageManager !== 'unknown') {
        console.log(`  ${pc.dim('Package mgr')} ${pc.white(analysis.packageManager)}`);
      }
      if (analysis.monorepo !== 'none') {
        console.log(`  ${pc.dim('Monorepo')}    ${pc.white(analysis.monorepo)} ${pc.dim(`(${analysis.workspaces.length} workspaces)`)}`);
      }
      if (analysis.hasDocker) {
        console.log(`  ${pc.dim('Docker')}      ${pc.green('detected')}`);
      }
      console.log();

      // Show warnings
      for (const w of analysis.warnings) {
        console.log(`  ${pc.yellow('!')} ${pc.yellow(w)}`);
      }
      if (analysis.warnings.length > 0) console.log();

      // Environment name
      let defaultEnv = DEFAULT_ENVIRONMENT;
      if (!options.yes) {
        defaultEnv = await input({
          message: 'Default environment:',
          default: DEFAULT_ENVIRONMENT,
        });
      }

      // Discover + suggest env files
      let trackedFiles: string[] = [];
      const composeFiles = discoverComposeEnvFiles();
      const discovered = discoverEnvFiles();
      const secrets = secretFiles(discovered);
      const templates = templateFiles(discovered);

      // Priority: compose > existing files > analyzer suggestions
      if (composeFiles.length > 0) {
        console.log(`  ${pc.dim('Docker Compose env_file paths:')}`);
        console.log();
        const seen = new Set<string>();
        for (const cf of composeFiles) {
          if (seen.has(cf.envFilePath)) continue;
          seen.add(cf.envFilePath);
          const exists = fs.existsSync(path.resolve(cf.envFilePath));
          const status = exists ? pc.green('●') : pc.yellow('○');
          const label = exists ? '' : pc.dim(' (not yet created)');
          console.log(`   ${status} ${pc.white(cf.envFilePath.padEnd(28))} ${pc.dim(`service: ${cf.service}`)}${label}`);
        }
        console.log();

        const uniquePaths = [...new Set(composeFiles.map((cf) => cf.envFilePath))];
        if (!options.yes && uniquePaths.length > 1) {
          const selected = await checkbox({
            message: 'Which env files should boltenv track?',
            choices: uniquePaths.map((p) => ({ name: p, value: p, checked: true })),
          });
          trackedFiles = selected;
        } else {
          trackedFiles = uniquePaths;
        }
      } else if (secrets.length > 0) {
        console.log(`  ${pc.dim('Env files found:')}`);
        console.log();
        for (const f of secrets) {
          console.log(`   ${pc.green('●')} ${pc.white(f.filename.padEnd(28))} ${pc.dim(`${f.varCount} vars`)}`);
        }
        for (const f of templates) {
          console.log(`   ${pc.yellow('○')} ${pc.dim(f.filename.padEnd(28))} ${pc.dim(`template — skipped`)}`);
        }
        console.log();

        if (secrets.length > 1 && !options.yes) {
          const selected = await checkbox({
            message: 'Which files should boltenv track?',
            choices: secrets.map((f) => ({
              name: `${f.filename}  ${pc.dim(`(${f.varCount} vars)`)}`,
              value: f.filename,
              checked: true,
            })),
          });
          trackedFiles = selected;
        } else if (secrets.length > 1) {
          trackedFiles = secrets.map((f) => f.filename);
        }
      } else if (analysis.suggestedEnvFiles.length > 0) {
        // No files exist yet — show suggestions from analyzer
        console.log(`  ${pc.dim('Suggested env files based on your project:')}`);
        console.log();
        for (const s of analysis.suggestedEnvFiles) {
          const keysHint = s.keys && s.keys.length > 0
            ? pc.dim(` (${s.keys.slice(0, 3).join(', ')}${s.keys.length > 3 ? ', ...' : ''})`)
            : '';
          console.log(`   ${pc.dim('○')} ${pc.white(s.filename.padEnd(24))} ${pc.dim(s.reason)}${keysHint}`);
        }
        console.log();

        if (!options.yes && analysis.suggestedEnvFiles.length > 1) {
          const selected = await checkbox({
            message: 'Which suggested files should boltenv track? (create them later)',
            choices: analysis.suggestedEnvFiles.map((s) => ({
              name: `${s.filename}  ${pc.dim(s.reason)}`,
              value: s.filename,
              checked: true,
            })),
          });
          trackedFiles = selected;
        } else {
          trackedFiles = analysis.suggestedEnvFiles.map((s) => s.filename);
        }
      }

      // Build config
      const configObj: Record<string, unknown> = {
        version: 2,
        defaultEnvironment: defaultEnv,
      };
      if (trackedFiles.length > 0) {
        configObj['files'] = trackedFiles;
      }

      // Suggest scripts based on analysis
      const suggestedScripts = buildScriptsConfig(analysis);
      if (suggestedScripts) {
        configObj['scripts'] = suggestedScripts;
      }

      const configContent =
        yamlStringify(configObj)
        + '\n# Map branch names to environments (optional)\n'
        + '# branchEnvironments:\n'
        + '#   main: production\n'
        + '#   staging: staging\n'
        + '#   release/*: staging\n';

      const configPath = path.resolve('.boltenv.yaml');
      fs.writeFileSync(configPath, configContent, 'utf8');

      // Add .env to .gitignore if not present
      ensureGitignore();

      console.log(actionSuccess(`Created ${pc.cyan('.boltenv.yaml')}`));

      if (trackedFiles.length > 0) {
        console.log(actionSuccess(`Tracking ${trackedFiles.length} env files: ${trackedFiles.join(', ')}`));
      }

      if (suggestedScripts) {
        console.log(actionSuccess(`Configured scripts: ${Object.entries(suggestedScripts).map(([k, v]) => `${k} → ${v}`).join(', ')}`));
      }

      console.log();

      if (!repoName) {
        console.log(hint('Add a GitHub remote to start sharing env vars'));
      } else {
        console.log(hint(`Run ${pc.cyan('boltenv push')} to upload your env files`));
        console.log(hint(`Run ${pc.cyan('boltenv pull')} to download env from team`));
      }

      if (analysis.suggestedDevCommand) {
        console.log(hint(`Run ${pc.cyan('boltenv dev')} to pull env + start: ${pc.dim(analysis.suggestedDevCommand)}`));
      }

      if (templates.length > 0) {
        console.log();
        console.log(hint(`Template files (${templates.map((t) => t.filename).join(', ')}) are skipped — keep them in git.`));
      }

      if (hasComposeFile()) {
        console.log(hint('Docker Compose detected — boltenv auto-discovers env_file paths.'));
      }
    });
}

/**
 * Build scripts config from analysis.
 */
function buildScriptsConfig(analysis: ProjectAnalysis): Record<string, string> | null {
  if (analysis.suggestedScripts.length === 0) return null;

  const scripts: Record<string, string> = {};
  for (const s of analysis.suggestedScripts) {
    scripts[s.name] = s.command;
  }
  return scripts;
}

/**
 * Ensure .env and .env.* are in .gitignore.
 */
function ensureGitignore(): void {
  const gitignorePath = path.resolve('.gitignore');
  const envPattern = '.env';
  const envWildcard = '.env.*';

  let content = '';
  try {
    content = fs.readFileSync(gitignorePath, 'utf8');
  } catch {
    // No .gitignore yet
  }

  const lines = content.split('\n');
  const hasEnv = lines.some((l) => l.trim() === envPattern);
  const hasEnvWild = lines.some((l) => l.trim() === envWildcard);

  if (hasEnv && hasEnvWild) return;

  const additions: string[] = [];
  if (!hasEnv) additions.push(envPattern);
  if (!hasEnvWild) additions.push(envWildcard);

  const newContent = content.trimEnd() + '\n\n# boltenv\n' + additions.join('\n') + '\n';
  fs.writeFileSync(gitignorePath, newContent, 'utf8');
}
