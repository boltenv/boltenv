import type { CustomSelections, ProjectLayer } from "../types.js";

export function createExpressLayer(selections: CustomSelections): ProjectLayer {
  const usePrisma = selections.database === "postgres-prisma" || selections.database === "sqlite-prisma";
  const useMongo = selections.database === "mongodb";

  const imports: string[] = [
    `import express from "express";`,
    `import cors from "cors";`,
  ];
  const middleware: string[] = [
    `app.use(cors({ origin: "http://localhost:3000" }));`,
    `app.use(express.json());`,
  ];
  const routes: string[] = [
    `app.get("/api/health", (_req, res) => {`,
    `  res.json({ status: "ok", timestamp: new Date().toISOString() });`,
    `});`,
  ];

  if (usePrisma) {
    imports.push(`import { prisma } from "./lib/db.js";`);
    routes.push("");
    routes.push(`app.get("/api/items", async (_req, res) => {`);
    routes.push(`  const items = await prisma.item.findMany();`);
    routes.push(`  res.json(items);`);
    routes.push(`});`);
  }

  if (useMongo) {
    imports.push(`import { connectDB } from "./lib/mongodb.js";`);
    middleware.push(`await connectDB();`);
  }

  const serverIndex = `${imports.join("\n")}

const app = express();
const PORT = process.env["PORT"] ?? 4000;

${middleware.join("\n")}

${routes.join("\n")}

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});
`;

  const tsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
`;

  return {
    files: {
      "server/src/index.ts": serverIndex,
      "server/tsconfig.json": tsconfig,
      "server/package.json": JSON.stringify({
        name: "server",
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "tsx watch src/index.ts",
          build: "tsc",
          start: "node dist/index.js",
        },
        dependencies: {
          express: "^5.0.0",
          cors: "^2.8.5",
        },
        devDependencies: {
          "@types/express": "^5.0.0",
          "@types/cors": "^2.8.17",
          tsx: "^4.21.0",
          typescript: "^5.7.0",
        },
      }, null, 2) + "\n",
    },
    dependencies: {},
    devDependencies: {
      concurrently: "^9.1.0",
    },
    scripts: {
      dev: "concurrently \"npm run dev:client\" \"npm run dev:server\"",
      "dev:client": "cd client && npm run dev",
      "dev:server": "cd server && npm run dev",
      build: "cd client && npm run build && cd ../server && npm run build",
    },
    envVars: {
      PORT: "4000",
    },
  };
}

export function createHonoLayer(selections: CustomSelections): ProjectLayer {
  const usePrisma = selections.database === "postgres-prisma" || selections.database === "sqlite-prisma";
  const useMongo = selections.database === "mongodb";

  const imports: string[] = [
    `import { Hono } from "hono";`,
    `import { cors } from "hono/cors";`,
  ];
  const routes: string[] = [
    `app.get("/api/health", (c) => {`,
    `  return c.json({ status: "ok", timestamp: new Date().toISOString() });`,
    `});`,
  ];

  if (usePrisma) {
    imports.push(`import { prisma } from "./lib/db.js";`);
    routes.push("");
    routes.push(`app.get("/api/items", async (c) => {`);
    routes.push(`  const items = await prisma.item.findMany();`);
    routes.push(`  return c.json(items);`);
    routes.push(`});`);
  }

  if (useMongo) {
    imports.push(`import { connectDB } from "./lib/mongodb.js";`);
    routes.splice(0, 0, `await connectDB();`);
  }

  const serverIndex = `${imports.join("\n")}
import { serve } from "@hono/node-server";

const app = new Hono();
const PORT = Number(process.env["PORT"] ?? 4000);

app.use("/api/*", cors({ origin: "http://localhost:3000" }));

${routes.join("\n")}

console.log(\`Server running on http://localhost:\${PORT}\`);
serve({ fetch: app.fetch, port: PORT });
`;

  const tsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
`;

  return {
    files: {
      "server/src/index.ts": serverIndex,
      "server/tsconfig.json": tsconfig,
      "server/package.json": JSON.stringify({
        name: "server",
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "tsx watch src/index.ts",
          build: "tsc",
          start: "node dist/index.js",
        },
        dependencies: {
          hono: "^4.6.0",
          "@hono/node-server": "^1.13.0",
        },
        devDependencies: {
          tsx: "^4.21.0",
          typescript: "^5.7.0",
        },
      }, null, 2) + "\n",
    },
    dependencies: {},
    devDependencies: {
      concurrently: "^9.1.0",
    },
    scripts: {
      dev: "concurrently \"npm run dev:client\" \"npm run dev:server\"",
      "dev:client": "cd client && npm run dev",
      "dev:server": "cd server && npm run dev",
      build: "cd client && npm run build && cd ../server && npm run build",
    },
    envVars: {
      PORT: "4000",
    },
  };
}
