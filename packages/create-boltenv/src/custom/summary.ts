import pc from "picocolors";
import type { CustomSelections } from "./types.js";
import {
  FRONTEND_LABELS,
  BACKEND_LABELS,
  STYLING_LABELS,
  DATABASE_LABELS,
  AUTH_LABELS,
} from "./types.js";

export function displaySummary(selections: CustomSelections): void {
  const lines: string[] = [];

  const row = (label: string, value: string): void => {
    lines.push(`  ${pc.dim(label.padEnd(14))} ${pc.bold(value)}`);
  };

  row("Frontend", FRONTEND_LABELS[selections.frontend]);

  if (selections.frontend !== "nextjs") {
    row("Backend", BACKEND_LABELS[selections.backend]);
  }

  row("Styling", STYLING_LABELS[selections.styling]);
  row("Database", DATABASE_LABELS[selections.database]);
  row("Auth", AUTH_LABELS[selections.auth]);

  const extras = selections.extras
    .map((e) => {
      switch (e) {
        case "docker": return "Docker";
        case "github-actions": return "GitHub Actions";
        case "eslint-prettier": return "ESLint + Prettier";
      }
    })
    .join(", ");

  row("Extras", extras || pc.dim("none"));

  console.log();
  console.log(`  ${pc.cyan(pc.bold("Your stack:"))}`);
  console.log();
  for (const line of lines) {
    console.log(line);
  }
  console.log();
}

export function stackOneLiner(selections: CustomSelections): string {
  const parts = [FRONTEND_LABELS[selections.frontend]];

  if (selections.frontend !== "nextjs" && selections.backend !== "none") {
    parts.push(BACKEND_LABELS[selections.backend]);
  }
  if (selections.styling !== "none") {
    parts.push(STYLING_LABELS[selections.styling]);
  }
  if (selections.database !== "none") {
    parts.push(DATABASE_LABELS[selections.database]);
  }
  if (selections.auth !== "none") {
    parts.push(AUTH_LABELS[selections.auth]);
  }

  return parts.join(" + ");
}
