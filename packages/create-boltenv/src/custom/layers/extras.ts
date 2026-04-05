import type { CustomSelections, ProjectLayer } from "../types.js";
import { hasBackendServer } from "../types.js";

export function createDockerLayer(selections: CustomSelections): ProjectLayer {
  const isNextjs = selections.frontend === "nextjs";
  const withBackend = hasBackendServer(selections);
  const needsPostgres = selections.database === "postgres-prisma";
  const needsMongo = selections.database === "mongodb";

  const services: string[] = [];

  if (isNextjs) {
    services.push(...nextjsDockerService());
  } else if (withBackend) {
    services.push(...monorepoDockerServices(selections));
  } else {
    services.push(...viteDockerService());
  }

  if (needsPostgres) {
    services.push(...postgresDockerService());
  }

  if (needsMongo) {
    services.push(...mongoDockerService());
  }

  const compose = `services:\n${services.join("\n")}\n`;

  const dockerignore = [
    "node_modules",
    ".next",
    "dist",
    ".git",
    ".env",
    ".env.local",
    "*.md",
  ].join("\n") + "\n";

  const files: Record<string, string> = {
    "docker-compose.yml": compose,
    ".dockerignore": dockerignore,
  };

  if (isNextjs) {
    files["Dockerfile"] = nextjsDockerfile();
  } else if (withBackend) {
    files["client/Dockerfile"] = viteDockerfile();
    files["server/Dockerfile"] = serverDockerfile();
  } else {
    files["Dockerfile"] = viteDockerfile();
  }

  return {
    files,
    dependencies: {},
    devDependencies: {},
    scripts: {
      "docker:up": "docker compose up -d",
      "docker:down": "docker compose down",
      "docker:build": "docker compose build",
    },
    envVars: {},
  };
}

export function createGithubActionsLayer(selections: CustomSelections): ProjectLayer {
  const isNextjs = selections.frontend === "nextjs";
  const buildCmd = isNextjs ? "npm run build" : "npm run build";
  const hasPrisma =
    selections.database === "postgres-prisma" ||
    selections.database === "sqlite-prisma";

  const ci = `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
${hasPrisma ? "\n      - name: Generate Prisma Client\n        run: npx prisma generate\n" : ""}
      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint --if-present

      - name: Build
        run: ${buildCmd}
`;

  return {
    files: {
      ".github/workflows/ci.yml": ci,
    },
    dependencies: {},
    devDependencies: {},
    scripts: {},
    envVars: {},
  };
}

export function createEslintPrettierLayer(selections: CustomSelections): ProjectLayer {
  const isNextjs = selections.frontend === "nextjs";

  const prettierrc = `{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
`;

  const deps: Record<string, string> = {
    prettier: "^3.4.0",
  };

  if (isNextjs) {
    deps["eslint"] = "^9.0.0";
    deps["eslint-config-next"] = "^15.1.0";
    deps["eslint-config-prettier"] = "^10.0.0";
  } else {
    deps["eslint"] = "^9.0.0";
    deps["eslint-config-prettier"] = "^10.0.0";
  }

  return {
    files: {
      ".prettierrc": prettierrc,
    },
    dependencies: {},
    devDependencies: deps,
    scripts: {
      format: "prettier --write .",
      "format:check": "prettier --check .",
    },
    envVars: {},
  };
}

function nextjsDockerService(): string[] {
  return [
    "  app:",
    "    build: .",
    "    ports:",
    '      - "3000:3000"',
    "    env_file: .env",
    "    depends_on: []",
    "",
  ];
}

function viteDockerService(): string[] {
  return [
    "  app:",
    "    build: .",
    "    ports:",
    '      - "3000:3000"',
    "    volumes:",
    "      - ./src:/app/src",
    "",
  ];
}

function monorepoDockerServices(selections: CustomSelections): string[] {
  const lines = [
    "  client:",
    "    build: ./client",
    "    ports:",
    '      - "3000:3000"',
    "    volumes:",
    "      - ./client/src:/app/src",
    "",
    "  server:",
    "    build: ./server",
    "    ports:",
    '      - "4000:4000"',
    "    env_file: .env",
  ];

  const deps: string[] = [];
  if (selections.database === "postgres-prisma") deps.push("postgres");
  if (selections.database === "mongodb") deps.push("mongo");

  if (deps.length > 0) {
    lines.push("    depends_on:");
    for (const d of deps) {
      lines.push(`      - ${d}`);
    }
  }

  lines.push("");
  return lines;
}

function postgresDockerService(): string[] {
  return [
    "  postgres:",
    "    image: postgres:16-alpine",
    "    ports:",
    '      - "5432:5432"',
    "    environment:",
    "      POSTGRES_USER: user",
    "      POSTGRES_PASSWORD: password",
    "      POSTGRES_DB: mydb",
    "    volumes:",
    "      - pgdata:/var/lib/postgresql/data",
    "",
    "volumes:",
    "  pgdata:",
    "",
  ];
}

function mongoDockerService(): string[] {
  return [
    "  mongo:",
    "    image: mongo:7",
    "    ports:",
    '      - "27017:27017"',
    "    volumes:",
    "      - mongodata:/data/db",
    "",
    "volumes:",
    "  mongodata:",
    "",
  ];
}

function nextjsDockerfile(): string {
  return `FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
`;
}

function viteDockerfile(): string {
  return `FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host"]
`;
}

function serverDockerfile(): string {
  return `FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]
`;
}
