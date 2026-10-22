import { parseArgs } from 'node:util';
import {
  driftExperiment,
  type ExperimentResult,
  mutationSelectionExperiment,
  type Ploidy,
  type ProgressFn,
  sweepExperiment,
  truncationExperiment,
} from '@plant-evo/sim';
import { playChapter, type Strategy, STRATEGIES } from './play.ts';

interface OptionSpec {
  default: number | string;
  help: string;
  /** Numeric options: allowed range (inclusive) and whether only whole numbers are valid. */
  min?: number;
  max?: number;
  integer?: boolean;
}

/** A count of individuals, generations, loci or replicates. */
const count = { integer: true, min: 1 } as const;
const probability = { min: 0, max: 1 } as const;

interface Command {
  summary: string;
  options: Record<string, OptionSpec>;
  run(values: Record<string, number | string>, onProgress: ProgressFn): ExperimentResult;
}

const common: Record<string, OptionSpec> = {
  seed: { default: 'plant-evo', help: 'Random seed (any string or number)' },
};

export const commands: Record<string, Command> = {
  drift: {
    summary: 'Neutral allele-frequency trajectories (genetic drift)',
    options: {
      ...common,
      size: { default: 100, help: 'Individuals per population', ...count },
      ploidy: { default: 2, help: '1 = haploid, 2 = diploid' },
      generations: { default: 200, help: 'Generations per replicate', ...count },
      replicates: { default: 10, help: 'Independent populations', ...count },
      p0: { default: 0.5, help: 'Starting allele frequency', ...probability },
    },
    run: (v, onProgress) =>
      driftExperiment(
        {
          seed: v.seed,
          size: num(v.size),
          ploidy: ploidy(v.ploidy),
          generations: num(v.generations),
          replicates: num(v.replicates),
          p0: num(v.p0),
        },
        onProgress,
      ),
  },
  sweep: {
    summary: 'Fate of a single new mutant under selection (as in the Mutation Draft)',
    options: {
      ...common,
      size: { default: 100, help: 'Individuals per population', ...count },
      ploidy: { default: 2, help: '1 = haploid, 2 = diploid' },
      s: { default: 0.05, help: 'Selection coefficient of the mutant homozygote', min: -1 },
      h: { default: 0.5, help: 'Dominance of the mutant (diploid)', ...probability },
      replicates: { default: 100, help: 'Independent introductions', ...count },
      'max-generations': {
        default: 10_000,
        help: 'Give up on a replicate after this long',
        ...count,
      },
    },
    run: (v, onProgress) =>
      sweepExperiment(
        {
          seed: v.seed,
          size: num(v.size),
          ploidy: ploidy(v.ploidy),
          s: num(v.s),
          h: num(v.h),
          replicates: num(v.replicates),
          maxGenerations: num(v['max-generations']),
        },
        onProgress,
      ),
  },
  mutsel: {
    summary: 'Mutation–selection balance for deleterious alleles',
    options: {
      ...common,
      size: { default: 1000, help: 'Individuals (diploid)', ...count },
      loci: { default: 20, help: 'Independent loci', ...count },
      mu: { default: 0.001, help: 'Mutation rate per locus per gene copy', ...probability },
      s: { default: 0.1, help: 'Fitness cost of the mutant homozygote', ...probability },
      h: { default: 0.5, help: 'Dominance of the deleterious allele', ...probability },
      generations: { default: 1000, help: 'Generations to run', ...count },
    },
    run: (v, onProgress) =>
      mutationSelectionExperiment(
        {
          seed: v.seed,
          size: num(v.size),
          loci: num(v.loci),
          mu: num(v.mu),
          s: num(v.s),
          h: num(v.h),
          generations: num(v.generations),
        },
        onProgress,
      ),
  },
  quant: {
    summary: "Truncation selection on a quantitative trait vs. the breeder's equation",
    options: {
      ...common,
      size: { default: 2000, help: 'Individuals (diploid)', integer: true, min: 2 },
      loci: { default: 100, help: 'Additive loci', ...count },
      effect: { default: 0.1, help: 'Effect of each "+" allele' },
      ve: { default: 0.5, help: 'Environmental variance', min: 0 },
      fraction: { default: 0.2, help: 'Fraction selected as parents', min: 0.001, max: 1 },
      generations: { default: 20, help: 'Generations of selection', ...count },
    },
    run: (v, onProgress) =>
      truncationExperiment(
        {
          seed: v.seed,
          size: num(v.size),
          loci: num(v.loci),
          effect: num(v.effect),
          environmentalVariance: num(v.ve),
          fraction: num(v.fraction),
          generations: num(v.generations),
        },
        onProgress,
      ),
  },
};

commands.play = {
  summary: 'Play a whole chapter headlessly with a scripted strategy',
  options: {
    ...common,
    scenario: { default: 'leaving-the-water', help: 'Scenario id' },
    strategy: { default: 'planned', help: `One of: ${STRATEGIES.join(', ')}` },
  },
  run: (v, onProgress) => {
    const strategy = String(v.strategy);
    if (!(STRATEGIES as readonly string[]).includes(strategy)) {
      throw new UsageError(`--strategy must be one of ${STRATEGIES.join(', ')}.`);
    }
    return playChapter(String(v.scenario), String(v.seed), strategy as Strategy, onProgress);
  },
};

export interface ParsedCommand {
  name: string;
  values: Record<string, number | string>;
  out: string | undefined;
}

/** Parses `<command> [--option value ...]`. Returns null when help was requested. */
export function parseCommandLine(argv: readonly string[]): ParsedCommand | null {
  const [name, ...rest] = argv;
  if (name === undefined || name === '--help' || name === '-h') return null;
  const command = commands[name];
  if (command === undefined) throw new UsageError(`Unknown command "${name}".`);

  const { values } = parseArgs({
    args: rest,
    strict: true,
    options: {
      out: { type: 'string', short: 'o' },
      help: { type: 'boolean', short: 'h' },
      ...Object.fromEntries(
        Object.keys(command.options).map((key) => [key, { type: 'string' as const }]),
      ),
    },
  });
  if (values.help === true) return null;

  const resolved: Record<string, number | string> = {};
  for (const [key, spec] of Object.entries(command.options)) {
    const raw = (values as Record<string, string | boolean | undefined>)[key];
    if (typeof raw !== 'string') {
      resolved[key] = spec.default;
    } else if (typeof spec.default === 'number') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed))
        throw new UsageError(`--${key} expects a number, got "${raw}".`);
      if (spec.integer === true && !Number.isInteger(parsed))
        throw new UsageError(`--${key} expects a whole number, got "${raw}".`);
      if (spec.min !== undefined && parsed < spec.min)
        throw new UsageError(`--${key} must be at least ${spec.min}, got ${raw}.`);
      if (spec.max !== undefined && parsed > spec.max)
        throw new UsageError(`--${key} must be at most ${spec.max}, got ${raw}.`);
      resolved[key] = parsed;
    } else {
      resolved[key] = raw;
    }
  }
  return { name, values: resolved, out: typeof values.out === 'string' ? values.out : undefined };
}

export function usage(): string {
  const lines = [
    'Usage: pnpm -s sim <command> [options] [--out file.csv]',
    '',
    'Runs a population-genetics experiment and writes tidy CSV (stdout by default).',
    'A summary comparing results with theory is printed to stderr.',
    '',
    'Commands:',
  ];
  for (const [name, command] of Object.entries(commands)) {
    lines.push(`  ${name.padEnd(8)}${command.summary}`);
    for (const [key, spec] of Object.entries(command.options)) {
      lines.push(`      --${key.padEnd(18)}${spec.help} (default: ${spec.default})`);
    }
  }
  return lines.join('\n');
}

export class UsageError extends Error {}

function num(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function ploidy(value: number | string): Ploidy {
  const p = num(value);
  if (p !== 1 && p !== 2) throw new UsageError(`--ploidy must be 1 or 2, got ${value}.`);
  return p;
}
