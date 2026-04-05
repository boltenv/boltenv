import fs from "node:fs";
import path from "node:path";
import type { CustomSelections, ProjectLayer } from "./types.js";
import {
  hasBackendServer,
  FRONTEND_LABELS,
  BACKEND_LABELS,
  STYLING_LABELS,
  DATABASE_LABELS,
  AUTH_LABELS,
} from "./types.js";
import { createBaseLayer } from "./layers/base.js";
import { createNextjsLayer } from "./layers/nextjs.js";
import { createReactViteLayer } from "./layers/react-vite.js";
import { createVueViteLayer } from "./layers/vue-vite.js";
import { createExpressLayer, createHonoLayer } from "./layers/backend.js";
import { createTailwindLayer, createCssModulesLayer } from "./layers/styling.js";
import { createDatabaseLayer } from "./layers/database.js";
import { createAuthLayer } from "./layers/auth.js";
import {
  createDockerLayer,
  createGithubActionsLayer,
  createEslintPrettierLayer,
} from "./layers/extras.js";

interface ComposedProject {
  readonly files: Readonly<Record<string, string>>;
}

export function composeProject(
  projectName: string,
  selections: CustomSelections,
): ComposedProject {
  const layers: ProjectLayer[] = [];

  layers.push(createBaseLayer(projectName, selections));

  switch (selections.frontend) {
    case "nextjs":
      layers.push(createNextjsLayer(projectName, selections));
      break;
    case "react-vite":
      layers.push(createReactViteLayer(projectName, selections));
      break;
    case "vue-vite":
      layers.push(createVueViteLayer(projectName, selections));
      break;
  }

  if (hasBackendServer(selections)) {
    switch (selections.backend) {
      case "express":
        layers.push(createExpressLayer(selections));
        break;
      case "hono":
        layers.push(createHonoLayer(selections));
        break;
    }
  }

  if (selections.styling === "tailwind") {
    layers.push(createTailwindLayer(selections));
  } else if (selections.styling === "css-modules") {
    layers.push(createCssModulesLayer(selections));
  }

  if (selections.database !== "none") {
    layers.push(createDatabaseLayer(selections));
  }

  if (selections.auth !== "none") {
    layers.push(createAuthLayer(selections));
  }

  for (const extra of selections.extras) {
    switch (extra) {
      case "docker":
        layers.push(createDockerLayer(selections));
        break;
      case "github-actions":
        layers.push(createGithubActionsLayer(selections));
        break;
      case "eslint-prettier":
        layers.push(createEslintPrettierLayer(selections));
        break;
    }
  }

  const merged = mergeLayers(layers);
  const allFiles = { ...merged.files };

  allFiles["package.json"] = generatePackageJson(
    projectName,
    merged,
    selections,
  );

  const envExample = generateEnvExample(merged.envVars);
  if (envExample) {
    allFiles[".env.example"] = envExample;
  }

  const layoutFile = generateEntryFile(projectName, selections);
  if (layoutFile) {
    allFiles[layoutFile.path] = layoutFile.content;
  }

  allFiles["README.md"] = generateReadme(projectName, selections);

  return { files: allFiles };
}

export function writeProject(targetDir: string, project: ComposedProject): void {
  for (const [filePath, content] of Object.entries(project.files)) {
    if (filePath.endsWith(".append")) continue;

    const fullPath = path.join(targetDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    const appendKey = `${filePath}.append`;
    const appendContent = project.files[appendKey];
    const finalContent = appendContent ? content + appendContent : content;

    fs.writeFileSync(fullPath, finalContent);
  }
}

interface MergedLayers {
  readonly files: Record<string, string>;
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
  readonly scripts: Record<string, string>;
  readonly envVars: Record<string, string>;
}

function mergeLayers(layers: readonly ProjectLayer[]): MergedLayers {
  const files: Record<string, string> = {};
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const scripts: Record<string, string> = {};
  const envVars: Record<string, string> = {};

  for (const layer of layers) {
    Object.assign(files, layer.files);
    Object.assign(dependencies, layer.dependencies);
    Object.assign(devDependencies, layer.devDependencies);
    Object.assign(scripts, layer.scripts);
    Object.assign(envVars, layer.envVars);
  }

  return { files, dependencies, devDependencies, scripts, envVars };
}

function generatePackageJson(
  projectName: string,
  merged: MergedLayers,
  selections: CustomSelections,
): string {
  const withBackend = hasBackendServer(selections);

  const pkg: Record<string, unknown> = {
    name: projectName,
    version: "0.1.0",
    private: true,
  };

  if (!withBackend) {
    pkg["type"] = "module";
  }

  if (withBackend) {
    pkg["workspaces"] = ["client", "server"];
    const { preview: _preview, ...rootScripts } = merged.scripts;
    pkg["scripts"] = rootScripts;
    if (Object.keys(merged.devDependencies).length > 0) {
      pkg["devDependencies"] = sortObject(merged.devDependencies);
    }
  } else {
    pkg["scripts"] = merged.scripts;
    if (Object.keys(merged.dependencies).length > 0) {
      pkg["dependencies"] = sortObject(merged.dependencies);
    }
    if (Object.keys(merged.devDependencies).length > 0) {
      pkg["devDependencies"] = sortObject(merged.devDependencies);
    }
  }

  return JSON.stringify(pkg, null, 2) + "\n";
}

function generateEnvExample(envVars: Readonly<Record<string, string>>): string | null {
  const entries = Object.entries(envVars);
  if (entries.length === 0) return null;

  return entries.map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
}

function generateEntryFile(
  projectName: string,
  selections: CustomSelections,
): { path: string; content: string } | null {
  if (selections.frontend === "nextjs") {
    return {
      path: "src/app/layout.tsx",
      content: generateNextjsLayout(projectName, selections),
    };
  }

  if (selections.frontend === "react-vite") {
    const prefix = hasBackendServer(selections) ? "client/" : "";
    return {
      path: `${prefix}src/main.tsx`,
      content: generateReactMain(selections),
    };
  }

  return null;
}

function generateNextjsLayout(
  projectName: string,
  selections: CustomSelections,
): string {
  const imports: string[] = [
    `import type { Metadata } from "next";`,
    `import "./globals.css";`,
  ];
  const wrappers: string[] = [];

  if (selections.auth === "nextauth") {
    imports.push(`import { SessionProvider } from "next-auth/react";`);
    wrappers.push("SessionProvider");
  } else if (selections.auth === "clerk") {
    imports.push(`import { ClerkProvider } from "@clerk/nextjs";`);
    wrappers.push("ClerkProvider");
  }

  let children = "{children}";
  for (const wrapper of [...wrappers].reverse()) {
    children = `<${wrapper}>\n            ${children}\n          </${wrapper}>`;
  }

  return `${imports.join("\n")}

export const metadata: Metadata = {
  title: "${projectName}",
  description: "Created with create-boltenv",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        ${children.includes("<") ? `${children}` : children}
      </body>
    </html>
  );
}
`;
}

function generateReactMain(selections: CustomSelections): string {
  const imports: string[] = [
    `import { StrictMode } from "react";`,
    `import { createRoot } from "react-dom/client";`,
    `import App from "./App.tsx";`,
    `import "./index.css";`,
  ];
  const wrappers: string[] = ["StrictMode"];

  if (selections.auth === "clerk") {
    imports.push(`import { ClerkProvider } from "@clerk/clerk-react";`);
    wrappers.push("ClerkProvider");
  }

  let inner = "<App />";
  for (const w of [...wrappers].reverse()) {
    inner = `<${w}>\n      ${inner}\n    </${w}>`;
  }

  return `${imports.join("\n")}

createRoot(document.getElementById("root")!).render(\n  ${inner.includes("\n") ? inner : `  ${inner}`}\n);\n`;
}

function sortObject(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function generateReadme(
  projectName: string,
  selections: CustomSelections,
): string {
  const lines: string[] = [];
  const withBackend = hasBackendServer(selections);
  const hasDocker = selections.extras.includes("docker");
  const needsDb = selections.database !== "none";
  const needsAuth = selections.auth !== "none";

  lines.push(`# ${projectName}`);
  lines.push("");
  lines.push("Created with [create-boltenv](https://boltenv.dev).");
  lines.push("");

  // Stack table
  lines.push("## Stack");
  lines.push("");
  lines.push("| Layer | Choice |");
  lines.push("|-------|--------|");
  lines.push(`| Frontend | ${FRONTEND_LABELS[selections.frontend]} |`);
  if (withBackend) {
    lines.push(`| Backend | ${BACKEND_LABELS[selections.backend]} |`);
  }
  if (selections.styling !== "none") {
    lines.push(`| Styling | ${STYLING_LABELS[selections.styling]} |`);
  }
  if (needsDb) {
    lines.push(`| Database | ${DATABASE_LABELS[selections.database]} |`);
  }
  if (needsAuth) {
    lines.push(`| Auth | ${AUTH_LABELS[selections.auth]} |`);
  }
  lines.push("");

  // Quick start
  lines.push("## Quick Start");
  lines.push("");

  if (hasDocker && needsDb) {
    lines.push("```bash");
    lines.push(`# 1. Start database`);
    lines.push(`docker compose up -d`);
    lines.push("");
    lines.push("# 2. Copy env and fill in your values");
    lines.push("cp .env.example .env");
    lines.push("");
    lines.push("# 3. Install dependencies");
    lines.push("npm install");
    lines.push("");

    const hasPrisma = selections.database === "postgres-prisma" || selections.database === "sqlite-prisma";
    if (hasPrisma) {
      lines.push("# 4. Push database schema");
      if (withBackend) {
        lines.push("cd server && npx prisma db push && cd ..");
      } else {
        lines.push("npx prisma db push");
      }
      lines.push("");
      lines.push("# 5. Start dev server");
    } else {
      lines.push("# 4. Start dev server");
    }
    lines.push("npm run dev");
    lines.push("```");
  } else if (needsDb || needsAuth) {
    lines.push("```bash");
    lines.push("# 1. Copy env and fill in your values");
    lines.push("cp .env.example .env");
    lines.push("");
    lines.push("# 2. Install dependencies");
    lines.push("npm install");
    lines.push("");

    const hasPrisma = selections.database === "postgres-prisma" || selections.database === "sqlite-prisma";
    if (hasPrisma) {
      lines.push("# 3. Push database schema");
      if (withBackend) {
        lines.push("cd server && npx prisma db push && cd ..");
      } else {
        lines.push("npx prisma db push");
      }
      lines.push("");
      lines.push("# 4. Start dev server");
    } else {
      lines.push("# 3. Start dev server");
    }
    lines.push("npm run dev");
    lines.push("```");
  } else {
    lines.push("```bash");
    lines.push("npm install");
    lines.push("npm run dev");
    lines.push("```");
  }

  lines.push("");

  // Environment variables
  if (needsDb || needsAuth) {
    lines.push("## Environment Variables");
    lines.push("");
    lines.push("Copy `.env.example` to `.env` and fill in the values:");
    lines.push("");

    if (selections.database === "postgres-prisma") {
      lines.push("- `DATABASE_URL` — PostgreSQL connection string");
    } else if (selections.database === "sqlite-prisma") {
      lines.push("- `DATABASE_URL` — SQLite file path (default: `file:./dev.db`)");
    } else if (selections.database === "mongodb") {
      lines.push("- `MONGODB_URI` — MongoDB connection string");
    }

    if (selections.auth === "nextauth") {
      lines.push("- `NEXTAUTH_SECRET` — Random secret (`openssl rand -base64 32`)");
      lines.push("- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — [GitHub OAuth App](https://github.com/settings/developers)");
    } else if (selections.auth === "clerk") {
      lines.push("- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — [Clerk Dashboard](https://dashboard.clerk.com)");
    }

    lines.push("");
  }

  // boltenv
  lines.push("## Environment Management");
  lines.push("");
  lines.push("This project uses [boltenv](https://boltenv.dev) for environment variable management.");
  lines.push("");
  lines.push("```bash");
  lines.push("boltenv login      # authenticate");
  lines.push("boltenv push       # push .env to team");
  lines.push("boltenv pull       # pull .env from team");
  lines.push("boltenv dev        # pull + start dev server");
  lines.push("```");
  lines.push("");

  return lines.join("\n") + "\n";
}
