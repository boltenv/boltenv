# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in boltenv, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, email **info@boltenv.dev** with:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Any suggested fixes (optional)

We will acknowledge your report within 48 hours and provide a timeline for a fix.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.x     | Yes       |
| 2.x     | Security fixes only |
| < 2.0   | No        |

## Security Model

boltenv uses a zero-trust architecture:

- **Encryption**: AES-256-GCM with fresh key and IV per push
- **Key storage**: Encryption keys never leave the developer's machine
- **Server access**: The boltenv cloud stores ciphertext only — it cannot decrypt your secrets
- **Authentication**: GitHub OAuth — access tied to repository permissions
- **Transport**: HTTPS (TLS 1.3) over already-encrypted payloads
- **Token storage**: Local auth tokens stored with `0o600` file permissions
- **Tamper detection**: GCM authentication tag verifies ciphertext integrity

For a full security overview, see [boltenv.dev/security](https://boltenv.dev/security).

## Scope

The following are in scope for security reports:

- CLI encryption/decryption logic
- Authentication and authorization bypass
- Server-side data exposure
- Path traversal or file system attacks
- Token storage vulnerabilities
- Supply chain risks in dependencies

The following are out of scope:

- Social engineering attacks
- Denial of service (unless trivially exploitable)
- Issues in third-party dependencies (report upstream, notify us)
