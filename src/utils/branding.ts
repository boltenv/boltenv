import pc from 'picocolors';

/**
 * Compact logo for bare `boltenv` command.
 */
export function printLogo(): void {
  console.log('');
  console.log(`  ${pc.yellow('⚡')} ${pc.bold(pc.white('bolt'))}${pc.bold(pc.yellow('env'))}  ${pc.dim('— AirDrop for .env files')}`);
  console.log(`  ${pc.dim('https://boltenv.dev')}`);
}

/**
 * Section header with bolt icon.
 */
export function header(text: string): string {
  return `  ${pc.yellow('⚡')} ${pc.bold(text)}`;
}

/**
 * Key-value display line.
 */
export function kvLine(label: string, value: string, labelWidth = 14): string {
  return `  ${pc.dim(label.padEnd(labelWidth))}${value}`;
}

/**
 * Compact usage bar: ████░░░░ 42/100
 */
export function usageBar(current: number, limit: number, width = 12): string {
  if (limit === Infinity) {
    return `${pc.green('█'.repeat(Math.min(current, 3)))}  ${current}/${pc.dim('∞')}`;
  }

  const ratio = Math.min(current / limit, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  const color = ratio >= 0.9 ? pc.red : ratio >= 0.7 ? pc.yellow : pc.green;
  return `${color('█'.repeat(filled))}${pc.dim('░'.repeat(empty))} ${color(`${current}/${limit}`)}`;
}

/**
 * Plan badge (inline).
 */
export function planBadge(plan: string): string {
  const label = plan.charAt(0).toUpperCase() + plan.slice(1);
  switch (plan) {
    case 'free': return pc.bgYellow(pc.black(` ${label} `));
    case 'pro': return pc.bgGreen(pc.black(` ${label} `));
    case 'enterprise': return pc.bgCyan(pc.black(` ${label} `));
    default: return label;
  }
}

/**
 * Role indicator for team members.
 */
export function roleBadge(role: string): string {
  switch (role) {
    case 'owner': return pc.red(`● ${role}`);
    case 'admin': return pc.yellow(`● ${role}`);
    case 'member': return pc.green(`● ${role}`);
    default: return role;
  }
}

/**
 * Success line.
 */
export function actionSuccess(message: string): string {
  return `  ${pc.green('✓')} ${message}`;
}

/**
 * Hint/next-step line.
 */
export function hint(message: string): string {
  return `  ${pc.dim('→')} ${message}`;
}
