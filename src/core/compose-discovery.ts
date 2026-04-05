import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Possible compose file names (in priority order) */
const COMPOSE_FILENAMES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
] as const;

export interface ComposeEnvFile {
  readonly service: string;
  readonly envFilePath: string;
  readonly filename: string;
}

/**
 * Detect docker-compose.yml and extract env_file paths from all services.
 * Returns empty array if no compose file found or no env_file directives.
 */
export function discoverComposeEnvFiles(cwd: string = process.cwd()): ReadonlyArray<ComposeEnvFile> {
  const composeFile = findComposeFile(cwd);
  if (!composeFile) return [];

  try {
    const content = fs.readFileSync(composeFile, 'utf8');
    const doc: unknown = parseYaml(content);
    if (!doc || typeof doc !== 'object') return [];

    const compose = doc as Record<string, unknown>;
    const services = compose['services'];
    if (!services || typeof services !== 'object') return [];

    const results: ComposeEnvFile[] = [];

    for (const [serviceName, serviceConfig] of Object.entries(services as Record<string, unknown>)) {
      if (!serviceConfig || typeof serviceConfig !== 'object') continue;
      const svc = serviceConfig as Record<string, unknown>;

      const envFile = svc['env_file'];
      if (!envFile) continue;

      // env_file can be a string or array of strings
      const paths = Array.isArray(envFile) ? envFile : [envFile];

      for (const p of paths) {
        if (typeof p !== 'string') continue;
        results.push({
          service: serviceName,
          envFilePath: p,
          filename: path.basename(p),
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Find a docker-compose file in the given directory.
 */
function findComposeFile(cwd: string): string | null {
  for (const name of COMPOSE_FILENAMES) {
    const candidate = path.join(cwd, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Check if the project uses Docker Compose.
 */
export function hasComposeFile(cwd: string = process.cwd()): boolean {
  return findComposeFile(cwd) !== null;
}
