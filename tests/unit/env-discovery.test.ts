import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoverEnvFiles, secretFiles, templateFiles } from '../../src/core/env-discovery.js';

describe('env-discovery', () => {
  const testDir = path.join(os.tmpdir(), `boltenv-discovery-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should return empty array when no env files exist', () => {
    const result = discoverEnvFiles(testDir);
    expect(result).toEqual([]);
  });

  it('should discover .env file', () => {
    fs.writeFileSync(path.join(testDir, '.env'), 'FOO=bar\nBAZ=qux\n');
    const result = discoverEnvFiles(testDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('.env');
    expect(result[0]!.varCount).toBe(2);
    expect(result[0]!.category).toBe('secret');
  });

  it('should discover .env.* files', () => {
    fs.writeFileSync(path.join(testDir, '.env'), 'A=1\n');
    fs.writeFileSync(path.join(testDir, '.env.backend'), 'B=2\nC=3\n');
    fs.writeFileSync(path.join(testDir, '.env.frontend'), 'D=4\n');

    const result = discoverEnvFiles(testDir);
    expect(result).toHaveLength(3);
    // .env should be first
    expect(result[0]!.filename).toBe('.env');
    // Then alphabetical
    expect(result[1]!.filename).toBe('.env.backend');
    expect(result[2]!.filename).toBe('.env.frontend');
  });

  it('should discover *.env files (backend.env pattern)', () => {
    fs.writeFileSync(path.join(testDir, 'backend.env'), 'DB_URL=postgres://...\n');
    const result = discoverEnvFiles(testDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('backend.env');
    expect(result[0]!.category).toBe('secret');
  });

  it('should classify .env.example as template', () => {
    fs.writeFileSync(path.join(testDir, '.env.example'), 'FOO=change_me\n');
    const result = discoverEnvFiles(testDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('template');
  });

  it('should classify .env.sample as template', () => {
    fs.writeFileSync(path.join(testDir, '.env.sample'), 'FOO=change_me\n');
    const result = discoverEnvFiles(testDir);
    expect(result[0]!.category).toBe('template');
  });

  it('should classify .env.template as template', () => {
    fs.writeFileSync(path.join(testDir, '.env.template'), 'FOO=change_me\n');
    const result = discoverEnvFiles(testDir);
    expect(result[0]!.category).toBe('template');
  });

  it('should classify .env.dist as template', () => {
    fs.writeFileSync(path.join(testDir, '.env.dist'), 'FOO=change_me\n');
    const result = discoverEnvFiles(testDir);
    expect(result[0]!.category).toBe('template');
  });

  it('should classify .env.defaults as template', () => {
    fs.writeFileSync(path.join(testDir, '.env.defaults'), 'FOO=change_me\n');
    const result = discoverEnvFiles(testDir);
    expect(result[0]!.category).toBe('template');
  });

  it('should classify .env.backend.example as template', () => {
    fs.writeFileSync(path.join(testDir, '.env.backend.example'), 'FOO=change_me\n');
    const result = discoverEnvFiles(testDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('.env.backend.example');
    expect(result[0]!.category).toBe('template');
  });

  it('should classify .env.backend.template as template', () => {
    fs.writeFileSync(path.join(testDir, '.env.backend.template'), 'FOO=change_me\n');
    const result = discoverEnvFiles(testDir);
    expect(result[0]!.category).toBe('template');
  });

  it('should classify example.env as template', () => {
    fs.writeFileSync(path.join(testDir, 'example.env'), 'FOO=change_me\n');
    const result = discoverEnvFiles(testDir);
    expect(result[0]!.category).toBe('template');
  });

  it('should sort secrets before templates', () => {
    fs.writeFileSync(path.join(testDir, '.env.backend'), 'SECRET=real\n');
    fs.writeFileSync(path.join(testDir, '.env.backend.example'), 'SECRET=change_me\n');
    fs.writeFileSync(path.join(testDir, '.env.frontend'), 'API=real\n');

    const result = discoverEnvFiles(testDir);
    expect(result).toHaveLength(3);
    expect(result[0]!.category).toBe('secret');
    expect(result[1]!.category).toBe('secret');
    expect(result[2]!.category).toBe('template');
  });

  it('should skip empty files', () => {
    fs.writeFileSync(path.join(testDir, '.env'), '');
    const result = discoverEnvFiles(testDir);
    expect(result).toHaveLength(0);
  });

  it('should skip directories named .env', () => {
    fs.mkdirSync(path.join(testDir, '.env'));
    const result = discoverEnvFiles(testDir);
    expect(result).toHaveLength(0);
  });

  it('should skip non-env files', () => {
    fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Hello');
    fs.writeFileSync(path.join(testDir, '.env'), 'A=1\n');
    const result = discoverEnvFiles(testDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.filename).toBe('.env');
  });

  it('secretFiles should filter to secrets only', () => {
    fs.writeFileSync(path.join(testDir, '.env'), 'A=1\n');
    fs.writeFileSync(path.join(testDir, '.env.example'), 'B=2\n');
    fs.writeFileSync(path.join(testDir, '.env.backend'), 'C=3\n');

    const all = discoverEnvFiles(testDir);
    const secrets = secretFiles(all);
    expect(secrets).toHaveLength(2);
    expect(secrets.every((f) => f.category === 'secret')).toBe(true);
  });

  it('templateFiles should filter to templates only', () => {
    fs.writeFileSync(path.join(testDir, '.env'), 'A=1\n');
    fs.writeFileSync(path.join(testDir, '.env.example'), 'B=2\n');
    fs.writeFileSync(path.join(testDir, '.env.sample'), 'C=3\n');

    const all = discoverEnvFiles(testDir);
    const templates = templateFiles(all);
    expect(templates).toHaveLength(2);
    expect(templates.every((f) => f.category === 'template')).toBe(true);
  });

  it('should handle mixed real-world project layout', () => {
    // A typical messy developer project
    fs.writeFileSync(path.join(testDir, '.env'), 'BASE=1\n');
    fs.writeFileSync(path.join(testDir, '.env.backend'), 'DB=postgres\nREDIS=redis://\n');
    fs.writeFileSync(path.join(testDir, '.env.frontend'), 'API_URL=http://...\n');
    fs.writeFileSync(path.join(testDir, '.env.example'), 'BASE=change_me\n');
    fs.writeFileSync(path.join(testDir, '.env.backend.example'), 'DB=change_me\n');
    fs.writeFileSync(path.join(testDir, '.env.local'), 'LOCAL_ONLY=true\n');
    fs.writeFileSync(path.join(testDir, '.env.backend.template'), 'DB=change_me\n');

    const all = discoverEnvFiles(testDir);
    const secrets = secretFiles(all);
    const templates = templateFiles(all);

    expect(secrets).toHaveLength(4); // .env, .env.backend, .env.frontend, .env.local
    expect(templates).toHaveLength(3); // .env.example, .env.backend.example, .env.backend.template
    expect(all).toHaveLength(7);
  });
});
