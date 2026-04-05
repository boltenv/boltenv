import { MAX_TTL_SECONDS, MIN_TTL_SECONDS } from '../constants.js';
import { BoltenvError } from '../utils/errors.js';

const TTL_PATTERN = /^(\d+)(s|m|h|d)$/;

const MULTIPLIERS: Readonly<Record<string, number>> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/**
 * Parse a human-readable TTL string (e.g., "7d", "24h", "30m") into seconds.
 * Validates bounds: minimum 60 seconds, maximum 90 days.
 */
export function parseTtl(input: string): number {
  const match = input.match(TTL_PATTERN);
  if (!match) {
    throw new BoltenvError(
      `Invalid TTL format: "${input}"`,
      'INVALID_TTL',
      'Use formats like "7d", "24h", "30m", or "3600s".',
    );
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;
  const multiplier = MULTIPLIERS[unit];
  if (multiplier === undefined) {
    throw new BoltenvError(
      `Invalid TTL format: "${input}"`,
      'INVALID_TTL',
      'Use formats like "7d", "24h", "30m", or "3600s".',
    );
  }

  const seconds = value * multiplier;

  if (seconds < MIN_TTL_SECONDS) {
    throw new BoltenvError(
      `TTL must be at least 60 seconds (got ${seconds}s).`,
      'TTL_TOO_SHORT',
      'Use a TTL of at least "60s" or "1m".',
    );
  }

  if (seconds > MAX_TTL_SECONDS) {
    throw new BoltenvError(
      `TTL cannot exceed 90 days (got ${Math.round(seconds / 86400)}d).`,
      'TTL_TOO_LONG',
      'Maximum TTL is "90d".',
    );
  }

  return seconds;
}

/**
 * Format a TTL in seconds to a human-readable string.
 */
export function formatTtl(seconds: number): string {
  if (seconds >= 86400) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
