#!/usr/bin/env node

import * as clack from "@clack/prompts";
import pc from "picocolors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCustomFlow } from "./custom/index.js";

const TEMPLATES = ["next", "t3", "turbo"] as const;
type Template = (typeof TEMPLATES)[number];
type TemplateOrCustom = Template | "custom";

const TEMPLATE_DESCRIPTIONS: Record<Template, string> = {
  next: "Next.js 16 + Tailwind + TypeScript",
  t3: "Next.js + tRPC + Prisma + NextAuth + Tailwind",
  turbo: "Turborepo monorepo (web + api + shared packages)",
};

const PACKAGE_MANAGERS = ["npm", "pnpm", "bun"] as const;
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

const ALL_TEMPLATES: readonly TemplateOrCustom[] = [...TEMPLATES, "custom"];
const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

function getTemplatesDir(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__dirname, "..", "templates");
}

function parseArgs(argv: readonly string[]): {
  name: string | undefined;
  template: TemplateOrCustom | undefined;
  packageManager: PackageManager | undefined;
} {
  const args = argv.slice(2);
  let name: string | undefined;
  let template: TemplateOrCustom | undefined;
  let packageManager: PackageManager | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--template" || arg === "-t") {
      const next = args[i + 1];
      if (next && ALL_TEMPLATES.includes(next as TemplateOrCustom)) {
        template = next as TemplateOrCustom;
      }
      i++;
    } else if (arg === "--pm") {
      const next = args[i + 1];
      if (next && PACKAGE_MANAGERS.includes(next as PackageManager)) {
        packageManager = next as PackageManager;
      }
      i++;
    } else if (arg && !arg.startsWith("-")) {
      name = arg;
    }
  }

  return { name, template, packageManager };
}

function isTTY(): boolean {
  return Boolean(process.stdin.isTTY);
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destName = entry.name.startsWith("_")
      ? `.${entry.name.slice(1)}`
      : entry.name;
    const destPath = path.join(dest, destName);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function replaceInFile(
  filePath: string,
  search: string,
  replacement: string,
): void {
  const content = fs.readFileSync(filePath, "utf-8");
  if (content.includes(search)) {
    fs.writeFileSync(filePath, content.replaceAll(search, replacement));
  }
}

function replaceProjectName(dir: string, projectName: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      replaceProjectName(fullPath, projectName);
    } else if (entry.isFile()) {
      replaceInFile(fullPath, "{{PROJECT_NAME}}", projectName);
    }
  }
}

async function main(): Promise<void> {
  console.log();
  clack.intro(`${pc.yellow("⚡")} ${pc.bold("boltenv")} — create a new project`);

  const parsed = parseArgs(process.argv);
  const interactive = isTTY();

  // --- Project name ---
  let projectName: string;
  if (parsed.name) {
    projectName = parsed.name;
  } else if (interactive) {
    const result = await clack.text({
      message: "Project name:",
      placeholder: "my-app",
      validate(value) {
        if (!value) return "Project name is required.";
        if (!PROJECT_NAME_RE.test(value))
          return "Name must start with a lowercase letter or digit, and contain only lowercase letters, digits, hyphens, dots, or underscores.";
        return undefined;
      },
    });
    if (clack.isCancel(result)) {
      clack.cancel("Cancelled.");
      process.exit(0);
    }
    projectName = result;
  } else {
    clack.cancel("Project name is required. Usage: create-boltenv <name> --template <next|t3|turbo|custom>");
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(targetDir)) {
    clack.cancel(
      `Directory ${pc.bold(projectName)} already exists. Pick a different name.`,
    );
    process.exit(1);
  }

  // --- Template selection ---
  let template: TemplateOrCustom;
  if (parsed.template) {
    template = parsed.template;
  } else if (interactive) {
    const result = await clack.select<TemplateOrCustom>({
      message: "Select a template:",
      options: [
        ...TEMPLATES.map((t) => ({
          value: t as TemplateOrCustom,
          label: `${pc.bold(t)} ${pc.dim("—")} ${TEMPLATE_DESCRIPTIONS[t]}`,
        })),
        {
          value: "custom" as TemplateOrCustom,
          label: `${pc.bold(pc.magenta("custom"))} ${pc.dim("—")} Build your own stack ${pc.yellow("✨")}`,
          hint: "pick frameworks, db, auth, docker",
        },
      ],
    });
    if (clack.isCancel(result)) {
      clack.cancel("Cancelled.");
      process.exit(0);
    }
    template = result;
  } else {
    clack.cancel("Template is required. Usage: create-boltenv <name> --template <next|t3|turbo|custom>");
    process.exit(1);
  }

  // --- Custom flow ---
  if (template === "custom") {
    const success = await runCustomFlow(projectName, targetDir, interactive);
    if (!success) process.exit(0);

    clack.note(
      [
        `cd ${projectName}`,
        `npm install`,
        `boltenv login`,
        `boltenv pull`,
        `boltenv dev`,
      ].join("\n"),
      "Next steps",
    );

    clack.outro(`${pc.green("Done!")} Happy coding.`);
    return;
  }

  // --- Preset template flow ---
  let packageManager: PackageManager;
  if (parsed.packageManager) {
    packageManager = parsed.packageManager;
  } else if (interactive) {
    const result = await clack.select({
      message: "Package manager:",
      options: PACKAGE_MANAGERS.map((pm) => ({
        value: pm,
        label: pm,
      })),
    });
    if (clack.isCancel(result)) {
      clack.cancel("Cancelled.");
      process.exit(0);
    }
    packageManager = result as PackageManager;
  } else {
    packageManager = "npm";
  }

  const templateDir = path.join(getTemplatesDir(), template);

  if (!fs.existsSync(templateDir)) {
    clack.cancel(
      `Template ${pc.bold(template)} not found at ${templateDir}`,
    );
    process.exit(1);
  }

  if (interactive) {
    const s = clack.spinner();
    s.start(`Scaffolding ${pc.bold(projectName)} with ${pc.cyan(template)} template`);
    copyDirRecursive(templateDir, targetDir);
    replaceProjectName(targetDir, projectName);
    s.stop(`Scaffolded ${pc.bold(projectName)} with ${pc.cyan(template)} template`);
  } else {
    copyDirRecursive(templateDir, targetDir);
    replaceProjectName(targetDir, projectName);
    clack.log.success(`Scaffolded ${pc.bold(projectName)} with ${pc.cyan(template)} template`);
  }

  clack.note(
    [
      `cd ${projectName}`,
      `${packageManager} install`,
      `boltenv login`,
      `boltenv pull`,
    ].join("\n"),
    "Next steps",
  );

  clack.outro(`${pc.green("Done!")} Happy coding.`);
}

main().catch((err: unknown) => {
  clack.cancel("An unexpected error occurred.");
  console.error(err);
  process.exit(1);
});
