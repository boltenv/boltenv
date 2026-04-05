import pc from 'picocolors';

export interface Logger {
  readonly info: (message: string) => void;
  readonly success: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string, hint?: string) => void;
  readonly dim: (message: string) => void;
}

export function createLogger(): Logger {
  return {
    info(message: string) {
      console.log(message);
    },

    success(message: string) {
      console.log(pc.green(`  ${message}`));
    },

    warn(message: string) {
      console.log(pc.yellow(`  Warning: ${message}`));
    },

    error(message: string, hint?: string) {
      console.error(pc.red(`  Error: ${message}`));
      if (hint) {
        console.error(pc.dim(`  ${hint}`));
      }
    },

    dim(message: string) {
      console.log(pc.dim(`  ${message}`));
    },
  };
}
