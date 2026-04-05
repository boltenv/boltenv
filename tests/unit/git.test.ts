import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseGitHubUrl, detectRepo, detectBranch, branchToEnvironment } from '../../src/core/git.js';

describe('git', () => {
  describe('parseGitHubUrl', () => {
    it('should parse HTTPS URL', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo.git');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should parse HTTPS URL without .git suffix', () => {
      const result = parseGitHubUrl('https://github.com/owner/repo');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should parse SSH URL', () => {
      const result = parseGitHubUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should parse SSH URL without .git suffix', () => {
      const result = parseGitHubUrl('git@github.com:owner/repo');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should handle hyphenated owner and repo names', () => {
      const result = parseGitHubUrl('https://github.com/my-org/my-repo.git');
      expect(result).toEqual({
        owner: 'my-org',
        repo: 'my-repo',
        fullName: 'my-org/my-repo',
      });
    });

    it('should handle underscored names', () => {
      const result = parseGitHubUrl('git@github.com:my_org/my_repo.git');
      expect(result).toEqual({
        owner: 'my_org',
        repo: 'my_repo',
        fullName: 'my_org/my_repo',
      });
    });

    it('should throw for non-GitHub HTTPS URL', () => {
      expect(() =>
        parseGitHubUrl('https://gitlab.com/owner/repo.git'),
      ).toThrow('Cannot parse GitHub remote URL');
    });

    it('should throw for non-GitHub SSH URL', () => {
      expect(() =>
        parseGitHubUrl('git@gitlab.com:owner/repo.git'),
      ).toThrow('Cannot parse GitHub remote URL');
    });

    it('should throw for invalid URL', () => {
      expect(() => parseGitHubUrl('not-a-url')).toThrow(
        'Cannot parse GitHub remote URL',
      );
    });

    it('should throw for empty string', () => {
      expect(() => parseGitHubUrl('')).toThrow(
        'Cannot parse GitHub remote URL',
      );
    });

    it('should handle HTTP URL', () => {
      const result = parseGitHubUrl('http://github.com/owner/repo.git');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });
  });

  describe('detectRepo', () => {
    const testDir = path.join(os.tmpdir(), `boltenv-git-test-${Date.now()}`);

    beforeEach(() => {
      fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should detect repo from git CLI', () => {
      // Create a real git repo in temp dir
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git remote add origin https://github.com/testowner/testrepo.git', {
        cwd: testDir,
        stdio: 'pipe',
      });

      const result = detectRepo(testDir);
      expect(result).toEqual({
        owner: 'testowner',
        repo: 'testrepo',
        fullName: 'testowner/testrepo',
      });
    });

    it('should detect SSH remote from git CLI', () => {
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git remote add origin git@github.com:sshowner/sshrepo.git', {
        cwd: testDir,
        stdio: 'pipe',
      });

      const result = detectRepo(testDir);
      expect(result).toEqual({
        owner: 'sshowner',
        repo: 'sshrepo',
        fullName: 'sshowner/sshrepo',
      });
    });

    it('should fallback to .git/config parsing', () => {
      // Create .git/config manually (no git init)
      const gitDir = path.join(testDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(
        path.join(gitDir, 'config'),
        [
          '[core]',
          '  repositoryformatversion = 0',
          '[remote "origin"]',
          '  url = https://github.com/fallback-owner/fallback-repo.git',
          '  fetch = +refs/heads/*:refs/remotes/origin/*',
        ].join('\n'),
        'utf8',
      );

      const result = detectRepo(testDir);
      expect(result).toEqual({
        owner: 'fallback-owner',
        repo: 'fallback-repo',
        fullName: 'fallback-owner/fallback-repo',
      });
    });

    it('should throw when no remote found', () => {
      // Empty directory, no git, no .git/config
      expect(() => detectRepo(testDir)).toThrow('No GitHub remote found');
    });

    it('should throw when git repo has no origin', () => {
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      // No remote added
      expect(() => detectRepo(testDir)).toThrow('No GitHub remote found');
    });
  });

  describe('detectBranch', () => {
    const testDir = path.join(os.tmpdir(), `boltenv-branch-test-${Date.now()}`);

    beforeEach(() => {
      fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should detect the current branch via git CLI', () => {
      execSync('git init -b main', { cwd: testDir, stdio: 'pipe' });
      // Need at least one commit for HEAD to exist
      execSync('git commit --allow-empty -m "init"', {
        cwd: testDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'test',
          GIT_AUTHOR_EMAIL: 'test@test.com',
          GIT_COMMITTER_NAME: 'test',
          GIT_COMMITTER_EMAIL: 'test@test.com',
        },
      });

      const branch = detectBranch(testDir);
      expect(branch).toBe('main');
    });

    it('should detect a feature branch', () => {
      execSync('git init -b main', { cwd: testDir, stdio: 'pipe' });
      execSync('git commit --allow-empty -m "init"', {
        cwd: testDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'test',
          GIT_AUTHOR_EMAIL: 'test@test.com',
          GIT_COMMITTER_NAME: 'test',
          GIT_COMMITTER_EMAIL: 'test@test.com',
        },
      });
      execSync('git checkout -b feature/my-feature', {
        cwd: testDir,
        stdio: 'pipe',
      });

      const branch = detectBranch(testDir);
      expect(branch).toBe('feature/my-feature');
    });

    it('should fallback to .git/HEAD parsing', () => {
      const gitDir = path.join(testDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(
        path.join(gitDir, 'HEAD'),
        'ref: refs/heads/develop\n',
        'utf8',
      );

      const branch = detectBranch(testDir);
      expect(branch).toBe('develop');
    });

    it('should throw when branch cannot be detected', () => {
      // Empty directory, no git
      expect(() => detectBranch(testDir)).toThrow('Could not detect the current git branch');
    });
  });

  describe('branchToEnvironment', () => {
    it('should map main to production', () => {
      expect(branchToEnvironment('main')).toBe('production');
    });

    it('should map master to production', () => {
      expect(branchToEnvironment('master')).toBe('production');
    });

    it('should map staging to staging', () => {
      expect(branchToEnvironment('staging')).toBe('staging');
    });

    it('should map develop to development', () => {
      expect(branchToEnvironment('develop')).toBe('development');
    });

    it('should map development to development', () => {
      expect(branchToEnvironment('development')).toBe('development');
    });

    it('should default unknown branches to development', () => {
      expect(branchToEnvironment('feature/login')).toBe('development');
      expect(branchToEnvironment('fix/bug-123')).toBe('development');
      expect(branchToEnvironment('release/v3')).toBe('development');
    });

    it('should use custom mapping when provided', () => {
      const custom = { 'release': 'staging', 'qa': 'qa' };
      expect(branchToEnvironment('release', custom)).toBe('staging');
      expect(branchToEnvironment('qa', custom)).toBe('qa');
    });

    it('should support prefix patterns with /*', () => {
      const custom = { 'release/*': 'staging', 'hotfix/*': 'production' };
      expect(branchToEnvironment('release/v3.1', custom)).toBe('staging');
      expect(branchToEnvironment('hotfix/urgent-fix', custom)).toBe('production');
    });

    it('should fall back to built-in map when custom has no match', () => {
      const custom = { 'deploy': 'deploy-env' };
      expect(branchToEnvironment('main', custom)).toBe('production');
      expect(branchToEnvironment('staging', custom)).toBe('staging');
    });

    it('should fall back to development when nothing matches', () => {
      const custom = { 'deploy': 'deploy-env' };
      expect(branchToEnvironment('feature/xyz', custom)).toBe('development');
    });
  });
});
