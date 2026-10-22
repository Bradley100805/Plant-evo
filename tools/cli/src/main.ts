import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { commands, parseCommandLine, usage, UsageError } from './commands.ts';
import { tableToCsv } from '@plant-evo/sim';

function main(argv: readonly string[]): number {
  let parsed;
  try {
    parsed = parseCommandLine(argv);
  } catch (error) {
    if (error instanceof UsageError || error instanceof TypeError) {
      process.stderr.write(`${error.message}\n\n${usage()}\n`);
      return 2;
    }
    throw error;
  }
  if (parsed === null) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  const showProgress = process.stderr.isTTY === true;
  const result = commands[parsed.name].run(parsed.values, (fraction) => {
    if (showProgress) process.stderr.write(`\r${parsed.name}: ${Math.round(fraction * 100)}%`);
  });
  if (showProgress) process.stderr.write('\n');

  const csv = tableToCsv(result.table);
  if (parsed.out === undefined) {
    process.stdout.write(csv);
  } else {
    // `pnpm sim` runs from tools/cli; resolve paths against the directory the user ran it from.
    const path = resolve(process.env.INIT_CWD ?? process.cwd(), parsed.out);
    writeFileSync(path, csv);
    process.stderr.write(`Wrote ${result.table.rows.length} rows to ${path}\n`);
  }

  process.stderr.write(`\nSummary (${parsed.name}, seed ${String(parsed.values.seed)}):\n`);
  for (const [key, value] of Object.entries(result.summary)) {
    process.stderr.write(
      `  ${key.padEnd(32)}${Number.isInteger(value) ? value : value.toPrecision(5)}\n`,
    );
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
