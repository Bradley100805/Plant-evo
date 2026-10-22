import type { GameSnapshot } from '@plant-evo/sim';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameMessage, GameRequest, GameView } from './protocol.ts';

export interface GameState {
  view: GameView | null;
  busy: boolean;
  progress: number;
  error: string | null;
}

export interface GameControls {
  newGame(seed: string, pure: boolean): void;
  run(choice: number | null): void;
  load(snapshot: GameSnapshot): void;
  save(): Promise<GameSnapshot>;
}

/** Talks to the game worker; keeps the latest view and simulation progress. */
export function useGame(scenario: string): [GameState, GameControls] {
  const [state, setState] = useState<GameState>({
    view: null,
    busy: false,
    progress: 0,
    error: null,
  });
  const workerRef = useRef<Worker | null>(null);
  const pendingSaves = useRef<((s: GameSnapshot) => void)[]>([]);

  const worker = useCallback(() => {
    if (workerRef.current === null) {
      const w = new Worker(new URL('./game.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (event: MessageEvent<GameMessage>) => {
        const message = event.data;
        switch (message.type) {
          case 'progress':
            setState((s) => ({ ...s, progress: message.fraction }));
            break;
          case 'state':
            setState({ view: message.view, busy: false, progress: 0, error: null });
            break;
          case 'snapshot':
            pendingSaves.current.shift()?.(message.snapshot);
            break;
          case 'error':
            setState((s) => ({ ...s, busy: false, error: message.message }));
            break;
        }
      };
      w.onerror = (event) => {
        setState((s) => ({ ...s, busy: false, error: event.message || 'The simulation failed' }));
      };
      workerRef.current = w;
    }
    return workerRef.current;
  }, []);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const send = useCallback(
    (request: GameRequest, busy = true) => {
      if (busy) setState((s) => ({ ...s, busy: true, progress: 0, error: null }));
      worker().postMessage(request);
    },
    [worker],
  );

  const controls = useMemo<GameControls>(
    () => ({
      newGame: (seed, pure) => send({ type: 'new', scenario, seed, pure }),
      run: (choice) => send({ type: 'run', choice }),
      load: (snapshot) => send({ type: 'load', snapshot }),
      // The worker answers requests in order, so saves resolve first-in, first-out.
      save: () =>
        new Promise<GameSnapshot>((resolve) => {
          pendingSaves.current.push(resolve);
          send({ type: 'save' }, false);
        }),
    }),
    [send, scenario],
  );
  return [state, controls];
}
