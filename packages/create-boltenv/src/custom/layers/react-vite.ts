import type { CustomSelections, ProjectLayer } from "../types.js";
import { clientPrefix } from "../types.js";

export function createReactViteLayer(
  projectName: string,
  selections: CustomSelections,
): ProjectLayer {
  const prefix = clientPrefix(selections);
  const tw = selections.styling === "tailwind";

  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

  const app = `function App() {
  return (
    <main${tw ? ' className="flex min-h-screen flex-col items-center justify-center gap-8 p-8"' : ""}>
      <h1${tw ? ' className="text-4xl font-bold"' : ""}>
        ${projectName}
      </h1>
      <p${tw ? ' className="text-lg text-gray-600"' : ""}>
        Built with create-boltenv
      </p>
      <a
        href="https://boltenv.dev"
        target="_blank"
        rel="noopener noreferrer"
        ${tw ? 'className="rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800"' : ""}
      >
        boltenv docs
      </a>
    </main>
  );
}

export default App;
`;

  const indexCss = tw
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

  const viteConfig = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
});
`;

  const tsconfig = `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
`;

  const viteEnvDts = `/// <reference types="vite/client" />
`;

  return {
    files: {
      [`${prefix}index.html`]: indexHtml,
      [`${prefix}vite.config.ts`]: viteConfig,
      [`${prefix}tsconfig.json`]: tsconfig,
      [`${prefix}src/App.tsx`]: app,
      [`${prefix}src/index.css`]: indexCss,
      [`${prefix}src/vite-env.d.ts`]: viteEnvDts,
    },
    dependencies: {
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.0",
      vite: "^6.0.0",
    },
    scripts: {
      dev: "vite",
      build: "tsc && vite build",
      preview: "vite preview",
    },
    envVars: {},
  };
}
