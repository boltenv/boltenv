import { describe, it, expect } from 'vitest';
import { parseTtl, formatTtl } from '../../src/core/ttl.js';

describe('ttl', () => {
  describe('parseTtl', () => {
    it('should parse seconds', () => {
      expect(parseTtl('120s')).toBe(120);
      expect(parseTtl('3600s')).toBe(3600);
    });

    it('should parse minutes', () => {
      expect(parseTtl('5m')).toBe(300);
      expect(parseTtl('60m')).toBe(3600);
    });

    it('should parse hours', () => {
      expect(parseTtl('1h')).toBe(3600);
      expect(parseTtl('24h')).toBe(86400);
    });

    it('should parse days', () => {
      expect(parseTtl('1d')).toBe(86400);
      expect(parseTtl('7d')).toBe(604800);
      expect(parseTtl('30d')).toBe(2592000);
    });

    it('should parse preset shortcuts', () => {
      expect(parseTtl('1h')).toBe(3600);
      expect(parseTtl('6h')).toBe(21600);
      expect(parseTtl('12h')).toBe(43200);
      expect(parseTtl('1d')).toBe(86400);
      expect(parseTtl('7d')).toBe(604800);
      expect(parseTtl('14d')).toBe(1209600);
      expect(parseTtl('30d')).toBe(2592000);
      expect(parseTtl('90d')).toBe(7776000);
    });

    it('should throw for TTL below minimum (60s)', () => {
      expect(() => parseTtl('30s')).toThrow('at least 60 seconds');
      expect(() => parseTtl('1s')).toThrow('at least 60 seconds');
    });

    it('should throw for TTL above maximum (90d)', () => {
      expect(() => parseTtl('91d')).toThrow('cannot exceed 90 days');
      expect(() => parseTtl('100d')).toThrow('cannot exceed 90 days');
    });

    it('should throw for invalid format', () => {
      expect(() => parseTtl('abc')).toThrow('Invalid TTL');
      expect(() => parseTtl('')).toThrow('Invalid TTL');
      expect(() => parseTtl('7')).toThrow('Invalid TTL');
      expect(() => parseTtl('7x')).toThrow('Invalid TTL');
    });
  });

  describe('formatTtl', () => {
    it('should format seconds to human-readable', () => {
      expect(formatTtl(60)).toBe('1 minute');
      expect(formatTtl(3600)).toBe('1 hour');
      expect(formatTtl(86400)).toBe('1 day');
      expect(formatTtl(604800)).toBe('7 days');
      expect(formatTtl(2592000)).toBe('30 days');
    });

    it('should handle mixed durations', () => {
      expect(formatTtl(7200)).toBe('2 hours');
      expect(formatTtl(172800)).toBe('2 days');
    });

    it('should handle small values', () => {
      expect(formatTtl(90)).toBe('1 minute');
      expect(formatTtl(120)).toBe('2 minutes');
    });
  });
});
