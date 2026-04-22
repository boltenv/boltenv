import { describe, it, expect } from 'vitest';
import {
  classifyGitHubError,
  type GitHubErrorContext,
} from '../../src/core/github-error-classifier.js';

function ctx(overrides: Partial<GitHubErrorContext>): GitHubErrorContext {
  return {
    status: 403,
    headers: new Headers(),
    ...overrides,
  };
}

describe('classifyGitHubError', () => {
  describe('401 — token invalid', () => {
    it('classifies any 401 as GITHUB_TOKEN_INVALID', () => {
      const err = classifyGitHubError(ctx({ status: 401 }));
      expect(err?.code).toBe('GITHUB_TOKEN_INVALID');
      expect(err?.hint).toContain('boltenv login');
    });
  });

  describe('rate limiting', () => {
    it('classifies 429 as GITHUB_RATE_LIMITED', () => {
      const err = classifyGitHubError(ctx({ status: 429 }));
      expect(err?.code).toBe('GITHUB_RATE_LIMITED');
    });

    it('classifies 403 + x-ratelimit-remaining:0 as GITHUB_RATE_LIMITED', () => {
      const headers = new Headers({ 'x-ratelimit-remaining': '0' });
      const err = classifyGitHubError(ctx({ status: 403, headers }));
      expect(err?.code).toBe('GITHUB_RATE_LIMITED');
    });

    it('does NOT classify 403 with a remaining budget as rate limited', () => {
      const headers = new Headers({ 'x-ratelimit-remaining': '4999' });
      const err = classifyGitHubError(
        ctx({ status: 403, headers, repoFullName: 'owner/repo' }),
      );
      expect(err?.code).toBe('REPO_ACCESS_DENIED');
    });

    it('formats reset time from x-ratelimit-reset header', () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 120;
      const headers = new Headers({
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(resetEpoch),
      });
      const err = classifyGitHubError(ctx({ status: 403, headers }));
      expect(err?.hint).toMatch(/Rate limit resets in ~\d+ minute/);
      expect(err?.hint).toContain('remaining');
    });
  });

  describe('SAML SSO enforcement', () => {
    it('classifies 403 + x-github-sso header as SAML_AUTH_REQUIRED', () => {
      const headers = new Headers({
        'x-github-sso':
          'required; url=https://github.com/orgs/spoiledwit/sso?authorization_request=abc',
      });
      const err = classifyGitHubError(
        ctx({ status: 403, headers, repoFullName: 'spoiledwit/xoblack' }),
      );
      expect(err?.code).toBe('SAML_AUTH_REQUIRED');
      expect(err?.message).toContain('spoiledwit');
      expect(err?.hint).toContain('https://github.com/orgs/spoiledwit/sso');
    });

    it('uses fallback settings URL when x-github-sso value is empty', () => {
      const headers = new Headers({ 'x-github-sso': '' });
      const err = classifyGitHubError(
        ctx({ status: 403, headers, repoFullName: 'org/repo' }),
      );
      expect(err?.code).toBe('SAML_AUTH_REQUIRED');
      expect(err?.hint).toContain('https://github.com/settings/tokens');
    });
  });

  describe('404 — not found or no access', () => {
    it('classifies 404 with repo context', () => {
      const err = classifyGitHubError(
        ctx({ status: 404, repoFullName: 'spoiledwit/xoblack' }),
      );
      expect(err?.code).toBe('REPO_NOT_FOUND_OR_NO_ACCESS');
      expect(err?.message).toContain('spoiledwit/xoblack');
    });

    it('returns null for 404 without repo context', () => {
      expect(classifyGitHubError(ctx({ status: 404 }))).toBeNull();
    });
  });

  describe('403 — generic fallback', () => {
    it('falls back to REPO_ACCESS_DENIED when repo is known', () => {
      const err = classifyGitHubError(
        ctx({ status: 403, repoFullName: 'spoiledwit/xoblack' }),
      );
      expect(err?.code).toBe('REPO_ACCESS_DENIED');
    });

    it('returns null for 403 without repo and without classification headers', () => {
      expect(classifyGitHubError(ctx({ status: 403 }))).toBeNull();
    });
  });

  describe('unclassified', () => {
    it('returns null for 500', () => {
      expect(classifyGitHubError(ctx({ status: 500 }))).toBeNull();
    });

    it('returns null for 200', () => {
      expect(classifyGitHubError(ctx({ status: 200 }))).toBeNull();
    });
  });
});
