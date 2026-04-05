import { describe, it, expect } from 'vitest';
import { BoltenvError, Errors } from '../../src/utils/errors.js';

describe('errors', () => {
  it('BoltenvError should have correct properties', () => {
    const err = new BoltenvError('test message', 'TEST_CODE', 'try this');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BoltenvError);
    expect(err.message).toBe('test message');
    expect(err.code).toBe('TEST_CODE');
    expect(err.hint).toBe('try this');
    expect(err.name).toBe('BoltenvError');
  });

  it('BoltenvError should work without hint', () => {
    const err = new BoltenvError('msg', 'CODE');
    expect(err.hint).toBeUndefined();
  });

  describe('Errors factory', () => {
    it('notAuthenticated', () => {
      const err = Errors.notAuthenticated();
      expect(err.code).toBe('NOT_AUTHENTICATED');
      expect(err.hint).toContain('boltenv login');
    });

    it('gitRepoNotFound', () => {
      const err = Errors.gitRepoNotFound();
      expect(err.code).toBe('GIT_REPO_NOT_FOUND');
    });

    it('gitRemoteNotFound', () => {
      const err = Errors.gitRemoteNotFound();
      expect(err.code).toBe('GIT_REMOTE_NOT_FOUND');
    });

    it('gitRemoteParseError', () => {
      const err = Errors.gitRemoteParseError('bad-url');
      expect(err.code).toBe('GIT_REMOTE_PARSE_ERROR');
      expect(err.message).toContain('bad-url');
    });

    it('decryptionFailed', () => {
      const err = Errors.decryptionFailed();
      expect(err.code).toBe('DECRYPTION_FAILED');
    });

    it('noRemoteData', () => {
      const err = Errors.noRemoteData('staging');
      expect(err.code).toBe('NO_REMOTE_DATA');
      expect(err.message).toContain('staging');
    });

    it('envFileNotFound', () => {
      const err = Errors.envFileNotFound('/path/.env');
      expect(err.code).toBe('ENV_FILE_NOT_FOUND');
      expect(err.message).toContain('/path/.env');
    });

    it('invalidTtl', () => {
      const err = Errors.invalidTtl('abc');
      expect(err.code).toBe('INVALID_TTL');
      expect(err.message).toContain('abc');
    });

    it('apiRequestFailed', () => {
      const err = Errors.apiRequestFailed(500, 'server error');
      expect(err.code).toBe('API_REQUEST_FAILED');
      expect(err.message).toContain('500');
    });

    it('apiTimeout', () => {
      const err = Errors.apiTimeout();
      expect(err.code).toBe('API_TIMEOUT');
    });

    it('repoAccessDenied', () => {
      const err = Errors.repoAccessDenied('owner/repo');
      expect(err.code).toBe('REPO_ACCESS_DENIED');
      expect(err.message).toContain('owner/repo');
    });

    it('loginFailed', () => {
      const err = Errors.loginFailed('bad token');
      expect(err.code).toBe('LOGIN_FAILED');
      expect(err.message).toContain('bad token');
    });

    it('loginExpired', () => {
      const err = Errors.loginExpired();
      expect(err.code).toBe('LOGIN_EXPIRED');
    });

    it('apiUnauthorized', () => {
      const err = Errors.apiUnauthorized();
      expect(err.code).toBe('API_UNAUTHORIZED');
      expect(err.hint).toContain('boltenv login');
    });

    it('apiForbidden', () => {
      const err = Errors.apiForbidden('owner/repo');
      expect(err.code).toBe('API_FORBIDDEN');
      expect(err.message).toContain('owner/repo');
    });

    it('versionNotFound', () => {
      const err = Errors.versionNotFound(5, 'production');
      expect(err.code).toBe('VERSION_NOT_FOUND');
      expect(err.message).toContain('5');
      expect(err.message).toContain('production');
    });

    it('branchDetectionFailed', () => {
      const err = Errors.branchDetectionFailed();
      expect(err.code).toBe('BRANCH_DETECTION_FAILED');
    });

    it('planLimitReached', () => {
      const err = Errors.planLimitReached('limit hit');
      expect(err.code).toBe('PLAN_LIMIT_REACHED');
      expect(err.message).toContain('limit hit');
    });

    it('teamNotAvailable', () => {
      const err = Errors.teamNotAvailable();
      expect(err.code).toBe('TEAM_NOT_FOUND');
    });

    it('teamFull', () => {
      const err = Errors.teamFull(5, 'free');
      expect(err.code).toBe('TEAM_FULL');
      expect(err.message).toContain('5');
    });

    it('alreadyOnPlan', () => {
      const err = Errors.alreadyOnPlan('pro');
      expect(err.code).toBe('ALREADY_ON_PLAN');
    });

    it('billingNotConfigured', () => {
      const err = Errors.billingNotConfigured();
      expect(err.code).toBe('BILLING_NOT_CONFIGURED');
    });

    it('devCommandEmpty', () => {
      const err = Errors.devCommandEmpty();
      expect(err.code).toBe('DEV_COMMAND_EMPTY');
    });

    it('invalidFormat', () => {
      const err = Errors.invalidFormat('yaml');
      expect(err.code).toBe('INVALID_FORMAT');
      expect(err.message).toContain('yaml');
    });

    it('invalidRole', () => {
      const err = Errors.invalidRole('hacker');
      expect(err.code).toBe('INVALID_ROLE');
      expect(err.message).toContain('hacker');
    });
  });
});
