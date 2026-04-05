import * as clack from "@clack/prompts";
import pc from "picocolors";
import { promptCustomSelections } from "./prompts.js";
import { displaySummary, stackOneLiner } from "./summary.js";
import { composeProject, writeProject } from "./composer.js";

export async function runCustomFlow(
  projectName: string,
  targetDir: string,
  interactive: boolean,
): Promise<boolean> {
  if (!interactive) {
    clack.cancel("Custom template requires interactive mode.");
    return false;
  }

  const selections = await promptCustomSelections();
  if (!selections) {
    clack.cancel("Cancelled.");
    return false;
  }

  displaySummary(selections);

  const confirm = await clack.confirm({
    message: "Scaffold this stack?",
    initialValue: true,
  });

  if (clack.isCancel(confirm) || !confirm) {
    clack.cancel("Cancelled.");
    return false;
  }

  const oneLiner = stackOneLiner(selections);
  const s = clack.spinner();
  s.start(`Scaffolding ${pc.bold(projectName)} with ${pc.cyan(oneLiner)}`);

  const project = composeProject(projectName, selections);
  writeProject(targetDir, project);

  s.stop(`Scaffolded ${pc.bold(projectName)} with ${pc.cyan(oneLiner)}`);

  return true;
}
