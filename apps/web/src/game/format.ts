import { TRAIT_INFO, type EpochReport, type VariantOffer } from '@plant-evo/sim';

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Lengths in metres as mm or cm, whichever reads better. */
export function formatHeight(metres: number): string {
  if (!Number.isFinite(metres) || metres <= 0) return '—';
  return metres < 0.01 ? `${(metres * 1000).toFixed(1)} mm` : `${(metres * 100).toFixed(1)} cm`;
}

export function formatMa(ma: number): string {
  return `${ma} million years ago`;
}

/** "Waxy cuticle 2" → "Waxy cuticle gene 2"; module genes are named as regulators. */
export function geneName(offer: VariantOffer): string {
  const match = /^(.*) (\d+)$/.exec(offer.gene);
  if (match !== null) return `${match[1]} gene ${match[2]}`;
  return `${offer.gene} regulator`;
}

/** One sentence on what a mutation does, in the direction it pushes the traits. */
export function offerSummary(offer: VariantOffer): string {
  const up = offer.effects.filter((e) => e.to > e.from).map((e) => TRAIT_INFO[e.trait].label);
  const down = offer.effects.filter((e) => e.to < e.from).map((e) => TRAIT_INFO[e.trait].label);
  const parts: string[] = [];
  if (up.length > 0) parts.push(`more ${listOf(up).toLowerCase()}`);
  if (down.length > 0) parts.push(`less ${listOf(down).toLowerCase()}`);
  return parts.length > 0 ? `Carriers develop ${parts.join(' and ')}.` : 'No visible effect.';
}

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** What happened to the epoch's chosen mutation, in words. */
export function fateText(report: EpochReport): string {
  const { chosen } = report;
  if (chosen === null) return 'You followed no new mutation this epoch.';
  const name = geneName(chosen).toLowerCase();
  const freq = `${Math.round(report.variantFrequency * 100)}%`;
  const times =
    report.origins === 1 ? 'once' : report.origins === 2 ? 'twice' : `${report.origins} times`;
  switch (report.fate) {
    case 'lost':
      return `The ${name} mutation arose ${times}, and every copy was lost.`;
    case 'rare':
      return `The ${name} mutation arose ${times} and survives, but only in ${freq} of plants.`;
    case 'spreading':
      return `The ${name} mutation arose ${times} and has spread to ${freq} of plants.`;
    case 'fixed':
      return `The ${name} mutation arose ${times} and is now carried by ${freq} of plants.`;
    case 'none':
      return 'You followed no new mutation this epoch.';
  }
}

export const FATE_LABEL: Record<EpochReport['fate'], string> = {
  none: 'No mutation',
  lost: 'Lost',
  rare: 'Rare',
  spreading: 'Spreading',
  fixed: 'Fixed',
};

/** A readable random seed, e.g. "rhynie-4821". */
export function randomSeed(): string {
  const words = ['rhynie', 'cooksonia', 'aglaophyton', 'chara', 'horneophyton', 'tortilicaulis'];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}-${Math.floor(1000 + Math.random() * 9000)}`;
}
