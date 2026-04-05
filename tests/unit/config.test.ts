import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadProjectConfig } from '../../src/core/config.js';

describe('config', () => {
  const testDir = path.join(os.tmpdir(), `boltenv-config-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should return null when no config file exists', () => {
    const result = loadProjectConfig(testDir);
    expect(result).toBeNull();
  });

  it('should load a valid .boltenv.yaml', () => {
    fs.writeFileSync(
      path.join(testDir, '.boltenv.yaml'),
      'version: 2\ndefaultEnvironment: staging\n',
      'utf8',
    );
    const result = loadProjectConfig(testDir);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
    expect(result!.defaultEnvironment).toBe('staging');
  });

  it('should load .boltenv.yml as fallback', () => {
    fs.writeFileSync(
      path.join(testDir, '.boltenv.yml'),
      'version: 2\ndefaultEnvironment: production\n',
      'utf8',
    );
    const result = loadProjectConfig(testDir);
    expect(result).not.toBeNull();
    expect(result!.defaultEnvironment).toBe('production');
  });

  it('should return null for invalid YAML', () => {
    fs.writeFileSync(
      path.join(testDir, '.boltenv.yaml'),
      ': invalid: yaml: [[[',
      'utf8',
    );
    const result = loadProjectConfig(testDir);
    expect(result).toBeNull();
  });

  it('should return null for wrong version', () => {
    fs.writeFileSync(
      path.join(testDir, '.boltenv.yaml'),
      'version: 1\ndefaultEnvironment: dev\n',
      'utf8',
    );
    const result = loadProjectConfig(testDir);
    expect(result).toBeNull();
  });

  it('should load config with branchEnvironments', () => {
    fs.writeFileSync(
      path.join(testDir, '.boltenv.yaml'),
      'version: 2\nbranchEnvironments:\n  release/*: staging\n  main: production\n',
      'utf8',
    );
    const result = loadProjectConfig(testDir);
    expect(result).not.toBeNull();
    expect(result!.branchEnvironments).toEqual({
      'release/*': 'staging',
      'main': 'production',
    });
  });

  it('should load config with scripts', () => {
    fs.writeFileSync(
      path.join(testDir, '.boltenv.yaml'),
      'version: 2\nscripts:\n  dev: npm run dev\n  start: npm start\n',
      'utf8',
    );
    const result = loadProjectConfig(testDir);
    expect(result).not.toBeNull();
    expect(result!.scripts).toEqual({
      dev: 'npm run dev',
      start: 'npm start',
    });
  });

  it('should stop searching at git root', () => {
    // Create a subdirectory with a .git marker
    const subDir = path.join(testDir, 'project');
    fs.mkdirSync(path.join(subDir, '.git'), { recursive: true });

    // Put config in parent (outside git root) — should NOT be found
    fs.writeFileSync(
      path.join(testDir, '.boltenv.yaml'),
      'version: 2\ndefaultEnvironment: parent\n',
      'utf8',
    );

    const result = loadProjectConfig(subDir);
    expect(result).toBeNull();
  });

  it('should find config in parent dir within git root', () => {
    // Create git root with config
    fs.mkdirSync(path.join(testDir, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, '.boltenv.yaml'),
      'version: 2\ndefaultEnvironment: root\n',
      'utf8',
    );

    // Search from a subdirectory
    const subDir = path.join(testDir, 'src');
    fs.mkdirSync(subDir, { recursive: true });

    const result = loadProjectConfig(subDir);
    expect(result).not.toBeNull();
    expect(result!.defaultEnvironment).toBe('root');
  });
});
