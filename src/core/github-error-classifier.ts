import { Errors, type BoltenvError } from '../utils/errors.js';

/**
 * Classify a failed GitHub API response into a targeted BoltenvError.
 *
 * Design principle: **lean on HTTP contract, not prose.** GitHub's status
 * codes and headers are stable API surface. Their error message bodies are
 * not — they get reworded, translated, and differ across endpoints. We only
 * match on signals GitHub documents as part of their API:
 *
 *   - `x-github-sso` header        → SAML enforcement
 *   - `x-ratelimit-remaining: 0`   → rate limited (even if status is 403)
 *   - HTTP status                  → token invalid (401), not found (404)
 *
 * Returns null for anything unrecognized so callers fall through to a
 * generic error instead of swallowing it.
 */

export interface GitHubErrorContext {
  readonly status: number;
  readonly headers: Headers;
  readonly repoFullName?: string;
}

function extractOrg(repoFullName: string | undefined): string | null {
  if (!repoFullName) return null;
  const [owner] = repoFullName.split('/');
  return owner && owner.length > 0 ? owner : null;
}

function isRateLimited(ctx: GitHubErrorContext): boolean {
  if (ctx.status === 429) return true;
  // GitHub returns 403 for primary rate limits. The authoritative signal
  // is `x-ratelimit-remaining: 0`, which is only set on rate-limited responses.
  return ctx.headers.get('x-ratelimit-remaining') === '0';
}

/**
 * Classify a GitHub error into a targeted BoltenvError, or return null if
 * no classification applies.
 */
export function classifyGitHubError(
  ctx: GitHubErrorContext,
): BoltenvError | null {
  // 401 — token is invalid, expired, or revoked.
  if (ctx.status === 401) {
    return Errors.githubTokenInvalid();
  }

  // Rate limiting — check headers first so we catch both 403 and 429 flavors.
  if (isRateLimited(ctx)) {
    return Errors.githubRateLimited(
      ctx.headers.get('x-ratelimit-remaining'),
      ctx.headers.get('x-ratelimit-reset'),
    );
  }

  // 403 — classify via headers only. No prose matching.
  if (ctx.status === 403) {
    // SAML SSO enforcement — GitHub sets x-github-sso with the auth URL.
    if (ctx.headers.has('x-github-sso')) {
      const ssoUrl = ctx.headers.get('x-github-sso')
        ?? 'https://github.com/settings/tokens';
      return Errors.samlAuthorizationRequired(
        extractOrg(ctx.repoFullName),
        ssoUrl,
      );
    }

    // Generic 403 — fall through to repo-scoped denial if we have context.
    if (ctx.repoFullName) {
      return Errors.repoAccessDenied(ctx.repoFullName);
    }
    return null;
  }

  // 404 — GitHub deliberately conflates "nonexistent" and "no access" for
  // private repos. Tell the user both possibilities.
  if (ctx.status === 404 && ctx.repoFullName) {
    return Errors.repoNotFoundOrNoAccess(ctx.repoFullName);
  }

  return null;
}

/**
 * Consume a failed GitHub Response and classify it. Safe to call on any
 * non-ok response. The body is intentionally ignored — classification is
 * status + headers only.
 */
export function classifyGitHubResponse(
  response: Response,
  repoFullName?: string,
): BoltenvError | null {
  return classifyGitHubError({
    status: response.status,
    headers: response.headers,
    repoFullName,
  });
}
