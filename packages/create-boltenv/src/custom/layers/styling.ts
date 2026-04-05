import type { CustomSelections, ProjectLayer } from "../types.js";
import { clientPrefix } from "../types.js";

export function createTailwindLayer(selections: CustomSelections): ProjectLayer {
  const prefix = clientPrefix(selections);

  if (selections.frontend === "nextjs") {
    return {
      files: {
        "postcss.config.mjs": `/** @type {import('postcss-load-config').Config} */\nconst config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n\nexport default config;\n`,
      },
      dependencies: {},
      devDependencies: {
        tailwindcss: "^4.0.0",
        "@tailwindcss/postcss": "^4.0.0",
      },
      scripts: {},
      envVars: {},
    };
  }

  return {
    files: {
      [`${prefix}postcss.config.mjs`]: `/** @type {import('postcss-load-config').Config} */\nconst config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n\nexport default config;\n`,
    },
    dependencies: {},
    devDependencies: {
      tailwindcss: "^4.0.0",
      "@tailwindcss/postcss": "^4.0.0",
      postcss: "^8.4.49",
    },
    scripts: {},
    envVars: {},
  };
}

export function createCssModulesLayer(selections: CustomSelections): ProjectLayer {
  const prefix = clientPrefix(selections);

  if (selections.frontend === "nextjs") {
    return {
      files: {
        "src/app/page.module.css": `.container {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  min-height: 100vh;\n  gap: 2rem;\n  padding: 2rem;\n}\n\n.title {\n  font-size: 2.5rem;\n  font-weight: bold;\n}\n\n.subtitle {\n  font-size: 1.125rem;\n  color: #666;\n}\n\n.link {\n  display: inline-block;\n  padding: 0.75rem 1.5rem;\n  background: #000;\n  color: #fff;\n  border-radius: 0.5rem;\n  text-decoration: none;\n}\n\n.link:hover {\n  background: #333;\n}\n`,
      },
      dependencies: {},
      devDependencies: {},
      scripts: {},
      envVars: {},
    };
  }

  return {
    files: {
      [`${prefix}src/App.module.css`]: `.container {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  min-height: 100vh;\n  gap: 2rem;\n  padding: 2rem;\n}\n\n.title {\n  font-size: 2.5rem;\n  font-weight: bold;\n}\n\n.subtitle {\n  font-size: 1.125rem;\n  color: #666;\n}\n\n.link {\n  display: inline-block;\n  padding: 0.75rem 1.5rem;\n  background: #000;\n  color: #fff;\n  border-radius: 0.5rem;\n  text-decoration: none;\n}\n\n.link:hover {\n  background: #333;\n}\n`,
    },
    dependencies: {},
    devDependencies: {},
    scripts: {},
    envVars: {},
  };
}
