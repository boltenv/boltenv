import * as clack from "@clack/prompts";
import pc from "picocolors";
import type { Frontend, Backend, Styling, Database, Auth, Extra, CustomSelections } from "./types.js";

export async function promptCustomSelections(): Promise<CustomSelections | null> {
  const frontend = await clack.select<Frontend>({
    message: "Frontend framework:",
    options: [
      { value: "nextjs", label: `${pc.bold("Next.js")} ${pc.dim("—")} App Router + React 19`, hint: "recommended" },
      { value: "react-vite", label: `${pc.bold("React")} ${pc.dim("—")} Vite + React 19` },
      { value: "vue-vite", label: `${pc.bold("Vue")} ${pc.dim("—")} Vite + Vue 3` },
    ],
  });
  if (clack.isCancel(frontend)) return null;

  let backend: Backend = "none";
  if (frontend !== "nextjs") {
    const result = await clack.select<Backend>({
      message: "Backend framework:",
      options: [
        { value: "express", label: `${pc.bold("Express.js")} ${pc.dim("—")} Minimal & flexible`, hint: "recommended" },
        { value: "hono", label: `${pc.bold("Hono")} ${pc.dim("—")} Ultrafast, Web Standards` },
        { value: "none", label: "None — frontend only" },
      ],
    });
    if (clack.isCancel(result)) return null;
    backend = result;
  }

  const styling = await clack.select<Styling>({
    message: "Styling:",
    options: [
      { value: "tailwind", label: `${pc.bold("Tailwind CSS")} ${pc.dim("—")} Utility-first CSS`, hint: "recommended" },
      { value: "css-modules", label: `${pc.bold("CSS Modules")} ${pc.dim("—")} Scoped CSS files` },
      { value: "none", label: "None — plain CSS" },
    ],
  });
  if (clack.isCancel(styling)) return null;

  const database = await clack.select<Database>({
    message: "Database:",
    options: [
      { value: "none", label: "None" },
      { value: "postgres-prisma", label: `${pc.bold("PostgreSQL")} ${pc.dim("—")} Prisma ORM`, hint: "production-ready" },
      { value: "sqlite-prisma", label: `${pc.bold("SQLite")} ${pc.dim("—")} Prisma ORM (zero setup)` },
      { value: "mongodb", label: `${pc.bold("MongoDB")} ${pc.dim("—")} Mongoose ODM` },
    ],
  });
  if (clack.isCancel(database)) return null;

  const authOptions: { value: Auth; label: string; hint?: string }[] = [
    { value: "none", label: "None" },
  ];
  if (frontend === "nextjs") {
    authOptions.push({
      value: "nextauth",
      label: `${pc.bold("NextAuth.js")} ${pc.dim("—")} Built-in auth for Next.js`,
      hint: "recommended for Next.js",
    });
  }
  authOptions.push({
    value: "clerk",
    label: `${pc.bold("Clerk")} ${pc.dim("—")} Drop-in auth UI + API`,
  });

  const auth = await clack.select<Auth>({
    message: "Authentication:",
    options: authOptions,
  });
  if (clack.isCancel(auth)) return null;

  const extras = await clack.multiselect<Extra>({
    message: `Extras ${pc.dim("(space to toggle)")}:`,
    options: [
      { value: "docker", label: `${pc.bold("Docker Compose")} ${pc.dim("—")} Containerized development` },
      { value: "github-actions", label: `${pc.bold("GitHub Actions")} ${pc.dim("—")} CI/CD pipeline` },
      { value: "eslint-prettier", label: `${pc.bold("ESLint + Prettier")} ${pc.dim("—")} Code formatting` },
    ],
    required: false,
  });
  if (clack.isCancel(extras)) return null;

  return {
    frontend: frontend as Frontend,
    backend,
    styling: styling as Styling,
    database: database as Database,
    auth: auth as Auth,
    extras: extras as Extra[],
  };
}
