# Contributing to boltenv

Thanks for your interest in contributing to boltenv.

## Getting Started

```bash
git clone https://github.com/boltenv/boltenv.git
cd boltenv
npm install
npm run dev -- whoami    # Run CLI in dev mode
npm test                 # Run tests
```

## Project Structure

```
boltenv/
├── src/                 # CLI source (TypeScript)
│   ├── commands/        # CLI command implementations
│   ├── core/            # Crypto, auth, git, API client
│   ├── types/           # TypeScript interfaces
│   └── utils/           # Validators, formatters
├── web/                 # Landing page + API (Next.js)
├── tests/               # Test suite (Vitest)
└── packages/            # Additional packages
```

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write tests first, then implement
4. Run `npm test` and `npm run typecheck`
5. Commit with conventional commits: `feat:`, `fix:`, `refactor:`, etc.
6. Open a pull request against `main`

## Code Style

- TypeScript strict mode
- Immutable patterns — create new objects, never mutate
- Zod validation at all boundaries
- Functions under 50 lines, files under 800 lines
- Handle errors explicitly — never swallow them

## Testing

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (80% threshold)
```

## Reporting Bugs

Use [GitHub Issues](https://github.com/boltenv/boltenv/issues) with the bug report template.

## Security Issues

See [SECURITY.md](./SECURITY.md) — do not open public issues for vulnerabilities.

## License

By contributing, you agree that your contributions will be licensed under the [FSL-1.1-MIT](../LICENSE) license.
