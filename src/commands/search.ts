import fs from 'node:fs';
import type { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';
import { loadCommandContext, requireRepoAccess } from './shared.js';
import { loadRepoKey } from '../core/key-store.js';
import { createApiClient } from '../core/api-client.js';
import { pullAllEntries } from '../core/env-resolver.js';
import { discoverEnvFiles, secretFiles } from '../core/env-discovery.js';
import { parseEnvFile } from '../core/env-file.js';

function maskValue(value: string): string {
  if (value.length === 0) return pc.dim('(empty)');
  if (value.length <= 6) return '****';
  return value.slice(0, 3) + pc.dim('****') + value.slice(-3);
}

export function registerSearch(program: Command): void {
  program
    .command('search')
    .description('Search for keys across all env files (local and remote)')
    .argument('<query>', 'Key name or pattern to search for (case-insensitive)')
    .option('-e, --env <environment>', 'Search in a specific remote environment')
    .option('-r, --repo <owner/repo>', 'Target repo')
    .option('--remote', 'Search remote (server) instead of local files', false)
    .option('--show-values', 'Show actual values (masked by default)', false)
    .option('--exact', 'Exact key match instead of substring', false)
    .action(async (query: string, options: {
      env?: string;
      repo?: string;
      remote: boolean;
      showValues: boolean;
      exact: boolean;
    }) => {
      const queryLower = query.toLowerCase();

      if (options.remote) {
        await searchRemote(queryLower, options);
      } else {
        searchLocal(queryLower, options);
      }
    });
}

// ---------------------------------------------------------------------------
// Local search — scan env files on disk
// ---------------------------------------------------------------------------

function searchLocal(
  query: string,
  options: { showValues: boolean; exact: boolean },
): void {
  const discovered = secretFiles(discoverEnvFiles());

  if (discovered.length === 0) {
    console.log(pc.yellow('  No env files found in current directory.'));
    return;
  }

  let totalMatches = 0;
  const fileResults: Array<{
    filename: string;
    matches: Array<{ key: string; value: string; lineNum: number }>;
  }> = [];

  for (const file of discovered) {
    const content = fs.readFileSync(file.absolutePath, 'utf8');
    const entries = parseEnvFile(content);
    const lines = content.split('\n');

    const matches: Array<{ key: string; value: string; lineNum: number }> = [];

    for (const entry of entries) {
      const keyLower = entry.key.toLowerCase();
      const valueLower = entry.value.toLowerCase();

      const keyMatch = options.exact
        ? keyLower === query
        : keyLower.includes(query);

      const valueMatch = !options.exact && valueLower.includes(query);

      if (keyMatch || valueMatch) {
        // Find line number
        const lineNum = lines.findIndex((l) => {
          const trimmed = l.trim();
          const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
          return withoutExport.startsWith(`${entry.key}=`);
        }) + 1;

        matches.push({ key: entry.key, value: entry.value, lineNum });
      }
    }

    if (matches.length > 0) {
      fileResults.push({ filename: file.filename, matches });
      totalMatches += matches.length;
    }
  }

  // Render results
  if (totalMatches === 0) {
    console.log(`  No matches for ${pc.yellow(query)} in ${discovered.length} local env files.`);
    console.log(pc.dim(`  Try: boltenv search ${query} --remote`));
    return;
  }

  console.log();
  console.log(`  ${pc.green(String(totalMatches))} match${totalMatches === 1 ? '' : 'es'} in ${pc.bold(String(fileResults.length))} file${fileResults.length === 1 ? '' : 's'}:`);
  console.log();

  for (const fr of fileResults) {
    console.log(`  ${pc.cyan(fr.filename)}`);

    for (const m of fr.matches) {
      const displayValue = options.showValues ? m.value : maskValue(m.value);

      // Highlight the query match in the key name
      const highlightedKey = highlightMatch(m.key, query);
      const lineRef = m.lineNum > 0 ? pc.dim(`:${m.lineNum}`) : '';

      console.log(`    ${lineRef.padEnd(12)} ${highlightedKey} ${pc.dim('=')} ${displayValue}`);
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Remote search — pull from server and search
// ---------------------------------------------------------------------------

async function searchRemote(
  query: string,
  options: { env?: string; repo?: string; showValues: boolean; exact: boolean },
): Promise<void> {
  const ctx = loadCommandContext(options.env, options.repo);
  await requireRepoAccess(ctx);

  const masterKey = loadRepoKey(ctx.repo.fullName);
  if (!masterKey) {
    console.log(pc.yellow('  No encryption key found. Run boltenv push first.'));
    return;
  }

  const spinner = ora(`Searching ${pc.yellow(ctx.environment)}...`).start();

  const api = createApiClient({
    baseUrl: ctx.apiBaseUrl,
    token: ctx.auth.accessToken,
    repo: ctx.repo.fullName,
  });

  const { files } = await pullAllEntries(ctx.environment, masterKey, api);
  spinner.stop();

  let totalMatches = 0;
  const fileResults: Array<{
    filename: string;
    matches: Array<{ key: string; value: string }>;
  }> = [];

  for (const file of files) {
    const matches: Array<{ key: string; value: string }> = [];

    for (const entry of file.entries) {
      const keyLower = entry.key.toLowerCase();
      const valueLower = entry.value.toLowerCase();

      const keyMatch = options.exact
        ? keyLower === query
        : keyLower.includes(query);

      const valueMatch = !options.exact && valueLower.includes(query);

      if (keyMatch || valueMatch) {
        matches.push({ key: entry.key, value: entry.value });
      }
    }

    if (matches.length > 0) {
      fileResults.push({ filename: file.filename, matches });
      totalMatches += matches.length;
    }
  }

  if (totalMatches === 0) {
    console.log(`  No matches for ${pc.yellow(query)} in ${pc.yellow(ctx.environment)} (${files.length} files).`);
    return;
  }

  console.log();
  console.log(`  ${pc.green(String(totalMatches))} match${totalMatches === 1 ? '' : 'es'} in ${pc.bold(String(fileResults.length))} file${fileResults.length === 1 ? '' : 's'} (${pc.yellow(ctx.environment)}):`);
  console.log();

  for (const fr of fileResults) {
    console.log(`  ${pc.cyan(fr.filename)}`);

    for (const m of fr.matches) {
      const displayValue = options.showValues ? m.value : maskValue(m.value);
      const highlightedKey = highlightMatch(m.key, query);

      console.log(`    ${highlightedKey} ${pc.dim('=')} ${displayValue}`);
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Highlight matching portion of a string
// ---------------------------------------------------------------------------

function highlightMatch(text: string, query: string): string {
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(query);
  if (idx === -1) return text;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);

  return `${before}${pc.yellow(pc.bold(match))}${after}`;
}
