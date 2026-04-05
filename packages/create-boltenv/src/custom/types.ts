export type Frontend = "nextjs" | "react-vite" | "vue-vite";
export type Backend = "none" | "express" | "hono";
export type Styling = "tailwind" | "css-modules" | "none";
export type Database = "none" | "postgres-prisma" | "mongodb" | "sqlite-prisma";
export type Auth = "none" | "nextauth" | "clerk";
export type Extra = "docker" | "github-actions" | "eslint-prettier";

export interface CustomSelections {
  readonly frontend: Frontend;
  readonly backend: Backend;
  readonly styling: Styling;
  readonly database: Database;
  readonly auth: Auth;
  readonly extras: readonly Extra[];
}

export interface ProjectLayer {
  readonly files: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly scripts: Readonly<Record<string, string>>;
  readonly envVars: Readonly<Record<string, string>>;
}

export function emptyLayer(): ProjectLayer {
  return { files: {}, dependencies: {}, devDependencies: {}, scripts: {}, envVars: {} };
}

export function hasBackendServer(s: CustomSelections): boolean {
  return s.frontend !== "nextjs" && s.backend !== "none";
}

export function clientPrefix(s: CustomSelections): string {
  return hasBackendServer(s) ? "client/" : "";
}

export const FRONTEND_LABELS: Record<Frontend, string> = {
  nextjs: "Next.js (App Router)",
  "react-vite": "React + Vite",
  "vue-vite": "Vue + Vite",
};

export const BACKEND_LABELS: Record<Backend, string> = {
  none: "None",
  express: "Express.js",
  hono: "Hono",
};

export const STYLING_LABELS: Record<Styling, string> = {
  tailwind: "Tailwind CSS",
  "css-modules": "CSS Modules",
  none: "None",
};

export const DATABASE_LABELS: Record<Database, string> = {
  none: "None",
  "postgres-prisma": "PostgreSQL + Prisma",
  mongodb: "MongoDB + Mongoose",
  "sqlite-prisma": "SQLite + Prisma",
};

export const AUTH_LABELS: Record<Auth, string> = {
  none: "None",
  nextauth: "NextAuth.js",
  clerk: "Clerk",
};
