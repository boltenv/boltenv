import type {
  PushRequest,
  PushResponse,
  PullRequest,
  PullResponse,
  LsRequest,
  LsResponse,
  WhoamiResponse,
  ApiErrorResponse,
  AccountResponse,
  TeamResponse,
  TeamMemberActionResponse,
  BillingCheckoutResponse,
  PlanTier,
  TeamRole,
} from '../types/index.js';
import type { ZodType } from 'zod';
import {
  PushResponseSchema,
  PullResponseSchema,
  LsResponseSchema,
  WhoamiResponseSchema,
  AccountResponseSchema,
  TeamResponseSchema,
  TeamMemberActionResponseSchema,
  BillingCheckoutResponseSchema,
} from '../utils/validators.js';
import { REQUEST_TIMEOUT_MS, MAX_RETRIES, RETRY_BASE_DELAY_MS } from '../constants.js';
import { Errors, sanitizeForTerminal } from '../utils/errors.js';

/** API client for communicating with boltenv API routes */
export interface ApiClient {
  readonly push: (req: PushRequest) => Promise<PushResponse>;
  readonly pull: (req: PullRequest) => Promise<PullResponse>;
  readonly ls: (req: LsRequest) => Promise<LsResponse>;
  readonly whoami: () => Promise<WhoamiResponse>;
  readonly account: () => Promise<AccountResponse>;
  readonly teamList: () => Promise<TeamResponse>;
  readonly teamAdd: (githubUser: string, role?: TeamRole) => Promise<TeamMemberActionResponse>;
  readonly teamRemove: (githubUser: string) => Promise<TeamMemberActionResponse>;
  readonly billingCheckout: (plan: PlanTier) => Promise<BillingCheckoutResponse>;
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly repo?: string;
}

/**
 * Sleep for exponential backoff.
 */
function backoffDelay(attempt: number): Promise<void> {
  const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Check if an HTTP status code is retryable.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Make an authenticated request to the boltenv API.
 * Retries up to MAX_RETRIES times on transient failures (5xx, 429, network).
 * Validates response body against Zod schema when provided.
 */
async function apiRequest<T>(
  options: ApiClientOptions,
  method: string,
  path: string,
  body?: unknown,
  schema?: ZodType<T>,
): Promise<T> {
  const url = `${options.baseUrl}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token}`,
    'Content-Type': 'application/json',
  };

  if (options.repo) {
    headers['X-Boltenv-Repo'] = options.repo;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await backoffDelay(attempt - 1);
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        lastError = Errors.apiTimeout();
        continue; // retry on timeout
      }
      if (error instanceof TypeError) {
        lastError = Errors.apiRequestFailed(0, 'Network error — check your internet connection.');
        continue; // retry on network error
      }
      throw error;
    }

    // Retry on transient server errors
    if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
      lastError = Errors.apiRequestFailed(response.status, `Retrying (attempt ${attempt + 1})...`);
      continue;
    }

    if (!response.ok) {
      return handleErrorResponse(response, options.repo ?? '');
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw Errors.apiRequestFailed(
        response.status,
        'Server returned invalid JSON. A proxy or CDN may be interfering.',
      );
    }

    if (schema) {
      const result = schema.safeParse(data);
      if (!result.success) {
        throw Errors.apiRequestFailed(
          response.status,
          'Unexpected response format from server.',
        );
      }
      return result.data;
    }

    return data as T;
  }

  // All retries exhausted
  throw lastError ?? Errors.apiTimeout();
}

/**
 * Map HTTP error codes to BoltenvError.
 */
async function handleErrorResponse(response: Response, repo: string): Promise<never> {
  let errorBody: ApiErrorResponse | null = null;
  try {
    errorBody = (await response.json()) as ApiErrorResponse;
  } catch {
    // Response body is not JSON
  }

  const message = sanitizeForTerminal(errorBody?.error ?? response.statusText);
  const serverHint = errorBody?.hint ? sanitizeForTerminal(errorBody.hint) : undefined;

  switch (response.status) {
    case 400:
      throw Errors.apiBadRequest(message, serverHint);
    case 401:
      throw Errors.apiUnauthorized();
    case 403:
      throw Errors.apiForbidden(repo);
    case 404:
      throw Errors.noRemoteData(sanitizeForTerminal(errorBody?.hint ?? 'unknown'));
    case 429:
      throw Errors.planLimitReached(message);
    default:
      throw Errors.apiRequestFailed(response.status, message);
  }
}

/**
 * Create an API client for communicating with boltenv API routes.
 * All endpoints validate responses against Zod schemas.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  return {
    async push(req: PushRequest): Promise<PushResponse> {
      return apiRequest<PushResponse>(options, 'POST', '/api/push', req, PushResponseSchema);
    },

    async pull(req: PullRequest): Promise<PullResponse> {
      return apiRequest<PullResponse>(options, 'POST', '/api/pull', req, PullResponseSchema);
    },

    async ls(req: LsRequest): Promise<LsResponse> {
      return apiRequest<LsResponse>(options, 'POST', '/api/ls', req, LsResponseSchema);
    },

    async whoami(): Promise<WhoamiResponse> {
      return apiRequest<WhoamiResponse>(options, 'GET', '/api/whoami', undefined, WhoamiResponseSchema);
    },

    async account(): Promise<AccountResponse> {
      return apiRequest<AccountResponse>(options, 'GET', '/api/account', undefined, AccountResponseSchema);
    },

    async teamList(): Promise<TeamResponse> {
      return apiRequest<TeamResponse>(options, 'GET', '/api/team', undefined, TeamResponseSchema);
    },

    async teamAdd(githubUser: string, role: TeamRole = 'member'): Promise<TeamMemberActionResponse> {
      return apiRequest<TeamMemberActionResponse>(
        options, 'POST', '/api/team/members',
        { githubUser, role },
        TeamMemberActionResponseSchema,
      );
    },

    async teamRemove(githubUser: string): Promise<TeamMemberActionResponse> {
      const encodedUser = encodeURIComponent(githubUser);
      return apiRequest<TeamMemberActionResponse>(
        options, 'DELETE', `/api/team/members/${encodedUser}`,
        undefined,
        TeamMemberActionResponseSchema,
      );
    },

    async billingCheckout(plan: PlanTier): Promise<BillingCheckoutResponse> {
      return apiRequest<BillingCheckoutResponse>(
        options, 'POST', '/api/billing/checkout',
        { plan },
        BillingCheckoutResponseSchema,
      );
    },
  };
}
