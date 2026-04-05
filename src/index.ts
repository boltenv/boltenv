#!/usr/bin/env node
import { createProgram, CLI_VERSION } from './cli.js';
import { checkForUpdates } from './core/update-notifier.js';
import { BoltenvError } from './utils/errors.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger();

async function main(): Promise<void> {
  // Start update check in background (non-blocking)
  const showUpdateAlert = checkForUpdates(CLI_VERSION);

  const program = await createProgram();
  await program.parseAsync(process.argv);

  // Show update alert after command completes (if available)
  showUpdateAlert();
}

main().catch((error: unknown) => {
  if (error instanceof BoltenvError) {
    logger.error(error.message, error.hint);
    process.exit(1);
  }
  if (error instanceof Error) {
    logger.error(error.message);
    process.exit(1);
  }
  logger.error('An unknown error occurred.');
  process.exit(1);
});
