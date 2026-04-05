import type { CustomSelections, ProjectLayer } from "../types.js";
import { clientPrefix } from "../types.js";

export function createVueViteLayer(
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
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

  const mainTs = `import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

createApp(App).mount("#app");
`;

  const appVue = `<script setup lang="ts">
const title = "${projectName}";
</script>

<template>
  <main${tw ? ' class="flex min-h-screen flex-col items-center justify-center gap-8 p-8"' : ""}>
    <h1${tw ? ' class="text-4xl font-bold"' : ""}>{{ title }}</h1>
    <p${tw ? ' class="text-lg text-gray-600"' : ""}>
      Built with create-boltenv
    </p>
    <a
      href="https://boltenv.dev"
      target="_blank"
      rel="noopener noreferrer"
      ${tw ? 'class="rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800"' : ""}
    >
      boltenv docs
    </a>
  </main>
</template>
`;

  const styleCss = tw
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
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: { port: 3000 },
});
`;

  const tsconfig = `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"]
}
`;

  const envDts = `/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
`;

  return {
    files: {
      [`${prefix}index.html`]: indexHtml,
      [`${prefix}vite.config.ts`]: viteConfig,
      [`${prefix}tsconfig.json`]: tsconfig,
      [`${prefix}src/main.ts`]: mainTs,
      [`${prefix}src/App.vue`]: appVue,
      [`${prefix}src/style.css`]: styleCss,
      [`${prefix}src/env.d.ts`]: envDts,
    },
    dependencies: {
      vue: "^3.5.0",
    },
    devDependencies: {
      "@vitejs/plugin-vue": "^5.2.0",
      "vue-tsc": "^2.2.0",
      vite: "^6.0.0",
    },
    scripts: {
      dev: "vite",
      build: "vue-tsc && vite build",
      preview: "vite preview",
    },
    envVars: {},
  };
}
