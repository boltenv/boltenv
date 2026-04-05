import { describe, it, expect } from 'vitest';
import { parseEnvFile, serializeEnvFile } from '../../src/core/env-file.js';

describe('env-file', () => {
  describe('parseEnvFile', () => {
    it('should parse simple KEY=VALUE pairs', () => {
      const input = 'DATABASE_URL=postgres://localhost/mydb\nAPI_KEY=sk-123';
      const result = parseEnvFile(input);
      expect(result).toEqual([
        { key: 'DATABASE_URL', value: 'postgres://localhost/mydb' },
        { key: 'API_KEY', value: 'sk-123' },
      ]);
    });

    it('should skip empty lines', () => {
      const input = 'KEY1=value1\n\nKEY2=value2\n\n';
      const result = parseEnvFile(input);
      expect(result).toEqual([
        { key: 'KEY1', value: 'value1' },
        { key: 'KEY2', value: 'value2' },
      ]);
    });

    it('should skip comment lines', () => {
      const input = '# This is a comment\nKEY=value\n# Another comment';
      const result = parseEnvFile(input);
      expect(result).toEqual([{ key: 'KEY', value: 'value' }]);
    });

    it('should handle double-quoted values', () => {
      const input = 'KEY="hello world"';
      const result = parseEnvFile(input);
      expect(result).toEqual([{ key: 'KEY', value: 'hello world' }]);
    });

    it('should handle single-quoted values', () => {
      const input = "KEY='hello world'";
      const result = parseEnvFile(input);
      expect(result).toEqual([{ key: 'KEY', value: 'hello world' }]);
    });

    it('should handle values with equals signs', () => {
      const input = 'URL=postgres://user:pass@host/db?ssl=true';
      const result = parseEnvFile(input);
      expect(result).toEqual([
        { key: 'URL', value: 'postgres://user:pass@host/db?ssl=true' },
      ]);
    });

    it('should handle empty values', () => {
      const input = 'EMPTY=\nALSO_EMPTY=';
      const result = parseEnvFile(input);
      expect(result).toEqual([
        { key: 'EMPTY', value: '' },
        { key: 'ALSO_EMPTY', value: '' },
      ]);
    });

    it('should trim whitespace around key and value', () => {
      const input = '  KEY  =  value  ';
      const result = parseEnvFile(input);
      expect(result).toEqual([{ key: 'KEY', value: 'value' }]);
    });

    it('should handle export prefix', () => {
      const input = 'export DATABASE_URL=postgres://localhost/mydb';
      const result = parseEnvFile(input);
      expect(result).toEqual([
        { key: 'DATABASE_URL', value: 'postgres://localhost/mydb' },
      ]);
    });

    it('should return empty array for empty input', () => {
      expect(parseEnvFile('')).toEqual([]);
      expect(parseEnvFile('   ')).toEqual([]);
      expect(parseEnvFile('\n\n')).toEqual([]);
    });

    it('should handle inline comments after unquoted values', () => {
      const input = 'KEY=value # this is a comment';
      const result = parseEnvFile(input);
      expect(result).toEqual([{ key: 'KEY', value: 'value' }]);
    });

    it('should preserve inline comments inside quoted values', () => {
      const input = 'KEY="value # not a comment"';
      const result = parseEnvFile(input);
      expect(result).toEqual([{ key: 'KEY', value: 'value # not a comment' }]);
    });

    it('should skip keys with invalid characters', () => {
      const input = 'VALID_KEY=good\n123BAD=bad\ninvalid key=bad\n_OK=ok';
      const result = parseEnvFile(input);
      expect(result).toEqual([
        { key: 'VALID_KEY', value: 'good' },
        { key: '_OK', value: 'ok' },
      ]);
    });

    it('should skip empty key names', () => {
      const input = '=value';
      const result = parseEnvFile(input);
      expect(result).toEqual([]);
    });

    it('should handle multiline double-quoted values', () => {
      const input = 'PRIVATE_KEY="-----BEGIN RSA KEY-----\nMIIEpAIBAAK\n-----END RSA KEY-----"';
      const result = parseEnvFile(input);
      expect(result).toEqual([
        { key: 'PRIVATE_KEY', value: '-----BEGIN RSA KEY-----\nMIIEpAIBAAK\n-----END RSA KEY-----' },
      ]);
    });

    it('should handle escaped characters in double-quoted values', () => {
      const input = 'MSG="hello\\nworld"';
      const result = parseEnvFile(input);
      expect(result).toEqual([{ key: 'MSG', value: 'hello\nworld' }]);
    });

    it('should handle escaped double quotes', () => {
      const input = 'VAL="say \\"hello\\""';
      const result = parseEnvFile(input);
      expect(result).toEqual([{ key: 'VAL', value: 'say "hello"' }]);
    });

    it('should handle escaped backslash', () => {
      const input = 'PATH_VAL="C:\\\\Users\\\\test"';
      const result = parseEnvFile(input);
      expect(result).toEqual([{ key: 'PATH_VAL', value: 'C:\\Users\\test' }]);
    });

    it('should not unescape single-quoted values', () => {
      const input = "RAW='hello\\nworld'";
      const result = parseEnvFile(input);
      expect(result).toEqual([{ key: 'RAW', value: 'hello\\nworld' }]);
    });
  });

  describe('serializeEnvFile', () => {
    it('should serialize entries to .env format', () => {
      const entries = [
        { key: 'DATABASE_URL', value: 'postgres://localhost/mydb' },
        { key: 'API_KEY', value: 'sk-123' },
      ];
      const result = serializeEnvFile(entries);
      expect(result).toBe(
        '# Generated by boltenv\nDATABASE_URL=postgres://localhost/mydb\nAPI_KEY=sk-123\n',
      );
    });

    it('should quote values with spaces', () => {
      const entries = [{ key: 'KEY', value: 'hello world' }];
      const result = serializeEnvFile(entries);
      expect(result).toContain('KEY="hello world"');
    });

    it('should quote values with special characters', () => {
      const entries = [{ key: 'KEY', value: 'value#with#hash' }];
      const result = serializeEnvFile(entries);
      expect(result).toContain('KEY="value#with#hash"');
    });

    it('should handle empty values', () => {
      const entries = [{ key: 'KEY', value: '' }];
      const result = serializeEnvFile(entries);
      expect(result).toContain('KEY=');
    });

    it('should handle empty entries array', () => {
      const result = serializeEnvFile([]);
      expect(result).toBe('# Generated by boltenv\n');
    });

    it('should be reversible (parse then serialize then parse)', () => {
      const original = [
        { key: 'DB', value: 'postgres://localhost/db' },
        { key: 'SECRET', value: 'abc123' },
        { key: 'EMPTY', value: '' },
      ];
      const serialized = serializeEnvFile(original);
      const parsed = parseEnvFile(serialized);
      expect(parsed).toEqual(original);
    });

    it('should escape double quotes in values', () => {
      const entries = [{ key: 'VAL', value: 'say "hello"' }];
      const result = serializeEnvFile(entries);
      expect(result).toContain('VAL="say \\"hello\\""');
    });

    it('should escape newlines in values', () => {
      const entries = [{ key: 'MULTI', value: 'line1\nline2' }];
      const result = serializeEnvFile(entries);
      expect(result).toContain('MULTI="line1\\nline2"');
    });

    it('should roundtrip values with special characters', () => {
      const original = [
        { key: 'QUOTES', value: 'say "hi"' },
        { key: 'NEWLINE', value: 'line1\nline2' },
        { key: 'BACKSLASH', value: 'C:\\Users\\test' },
      ];
      const serialized = serializeEnvFile(original);
      const parsed = parseEnvFile(serialized);
      expect(parsed).toEqual(original);
    });
  });
});
