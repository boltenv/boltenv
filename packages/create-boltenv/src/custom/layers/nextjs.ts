import type { CustomSelections, ProjectLayer } from "../types.js";

export function createNextjsLayer(
  projectName: string,
  selections: CustomSelections,
): ProjectLayer {
  const page = `export default function Home() {
  return (
    <main>
      <div className="${selections.styling === "tailwind" ? "flex min-h-screen flex-col items-center justify-center gap-8 p-8" : ""}">
        <h1${selections.styling === "tailwind" ? ' className="text-4xl font-bold"' : ""}>
          ${projectName}
        </h1>
        <p${selections.styling === "tailwind" ? ' className="text-lg text-gray-600 dark:text-gray-400"' : ""}>
          Built with create-boltenv
        </p>
        <div${selections.styling === "tailwind" ? ' className="flex gap-4"' : ""}>
          <a
            href="https://boltenv.dev"
            target="_blank"
            rel="noopener noreferrer"
            ${selections.styling === "tailwind" ? 'className="rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"' : ""}
          >
            boltenv docs
          </a>
        </div>
      </div>
    </main>
  );
}
`;

  const globalsCss = selections.styling === "tailwind"
    ? "@import \"tailwindcss\";\n"
    : `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  color: #333;
}
`;

  const nextConfig = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
`;

  const tsconfig = `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`;

  return {
    files: {
      "next.config.ts": nextConfig,
      "tsconfig.json": tsconfig,
      "src/app/page.tsx": page,
      "src/app/globals.css": globalsCss,
    },
    dependencies: {
      next: "^15.1.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
    },
    scripts: {
      dev: "next dev --turbo",
      build: "next build",
      start: "next start",
      lint: "next lint",
    },
    envVars: {},
  };
}
