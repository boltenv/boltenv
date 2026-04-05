import type { CustomSelections, ProjectLayer } from "../types.js";
import { hasBackendServer } from "../types.js";

export function createBaseLayer(
  _projectName: string,
  selections: CustomSelections,
): ProjectLayer {
  const devScript = getDevScript(selections);

  const boltenvYaml = [
    "version: 2",
    "defaultEnvironment: development",
    "ttl: 7d",
    "",
    "environments:",
    "  production:",
    "    ttl: 90d",
    "  staging:",
    "    ttl: 30d",
    "  development:",
    "    ttl: 7d",
    "",
    "scripts:",
    `  dev: ${devScript}`,
  ].join("\n") + "\n";

  const gitignore = [
    "node_modules/",
    "dist/",
    ".next/",
    ".nuxt/",
    ".output/",
    ".env",
    ".env.local",
    ".env*.local",
    "*.tsbuildinfo",
    ".turbo/",
    "coverage/",
  ].join("\n") + "\n";

  return {
    files: {
      ".gitignore": gitignore,
      ".boltenv.yaml": boltenvYaml,
    },
    dependencies: {},
    devDependencies: {
      "@types/node": "^22.0.0",
      typescript: "^5.7.0",
    },
    scripts: {},
    envVars: {},
  };
}

function getDevScript(s: CustomSelections): string {
  if (s.frontend === "nextjs") return "next dev --turbo";
  if (hasBackendServer(s)) return "npm run dev";
  return "vite";
}
