import { TRAIT_INFO, type VariantOffer } from '@plant-evo/sim';
import { geneName, offerSummary } from './format.ts';

/**
 * The Mutation Draft: the random mutations that arose this epoch. In Lineage mode the player
 * picks one to follow (or none); in Pure mode nature's pick is shown and the player only runs.
 */
export function DraftPanel({
  offers,
  pure,
  natureChoice,
  generations,
  disabled,
  onChoose,
  onInfo,
}: {
  offers: VariantOffer[];
  pure: boolean;
  natureChoice: number | null;
  generations: number;
  disabled: boolean;
  onChoose: (choice: number | null) => void;
  onInfo: (id: string) => void;
}) {
  return (
    <section className="draft" aria-labelledby="draft-title">
      <div className="draft-head">
        <h3 id="draft-title">{pure ? 'Mutations that arose' : 'Choose a mutation to follow'}</h3>
        <button type="button" className="link-button" onClick={() => onInfo('draft')}>
          What does choosing mean?
        </button>
      </div>
      <p className="draft-lede">
        {pure
          ? `Pure mode: nature picks one of these at random, or none. It arises several times during the next ${generations} generations, and selection and chance decide its fate.`
          : `These mutations arose by chance. Pick one: it will arise in a few random plants during the next ${generations} generations. Whether it spreads depends on what it does to them where they live, and on luck.`}
      </p>
      <ul className="offers">
        {offers.map((offer) => {
          const picked = pure && natureChoice === offer.index;
          return (
            <li key={offer.index} className={picked ? 'offer picked' : 'offer'}>
              <h4>{geneName(offer)}</h4>
              <p className="offer-summary">{offerSummary(offer)}</p>
              <ul className="effects" aria-label="Expected effect in a plant carrying it">
                {offer.effects.map((e) => (
                  <li key={e.trait}>
                    <button type="button" className="effect-name" onClick={() => onInfo(e.trait)}>
                      {TRAIT_INFO[e.trait].label}
                    </button>
                    <EffectBar from={e.from} to={e.to} />
                    <span className="effect-values">
                      {e.from.toFixed(2)} → <strong>{e.to.toFixed(2)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
              {pure ? (
                picked && <p className="nature-pick">Nature’s pick</p>
              ) : (
                <button
                  type="button"
                  className="choose-button"
                  disabled={disabled}
                  onClick={() => onChoose(offer.index)}
                >
                  Follow this mutation
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="draft-actions">
        {pure ? (
          <>
            {natureChoice === null && <span className="note">Nature’s pick: none of these.</span>}
            <button
              type="button"
              className="run-button"
              disabled={disabled}
              onClick={() => onChoose(null)}
            >
              Run {generations} generations
            </button>
          </>
        ) : (
          <button
            type="button"
            className="secondary-button"
            disabled={disabled}
            onClick={() => onChoose(null)}
          >
            Follow none: let selection act on existing variation
          </button>
        )}
      </div>
    </section>
  );
}

/** Before-and-after on a 0–1 track: a muted mark for now, a solid bar for the carrier. */
function EffectBar({ from, to }: { from: number; to: number }) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return (
    <span className="effect-bar" aria-hidden="true">
      <span
        className={to >= from ? 'span up' : 'span down'}
        style={{ left: `${lo * 100}%`, width: `${Math.max(0.5, (hi - lo) * 100)}%` }}
      />
      <span className="mark" style={{ left: `${from * 100}%` }} />
    </span>
  );
}
