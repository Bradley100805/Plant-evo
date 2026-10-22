import type { ExperimentResult } from '@plant-evo/sim';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExperimentRequest, WorkerMessage } from '../worker/protocol.ts';

export interface ExperimentState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number;
  result: ExperimentResult | null;
  /** The request that produced `result` (a newer run may be in flight). */
  request: ExperimentRequest | null;
  elapsedMs: number;
  error: string | null;
}

const initial: ExperimentState = {
  status: 'idle',
  progress: 0,
  result: null,
  request: null,
  elapsedMs: 0,
  error: null,
};

/**
 * Runs experiments in a dedicated Web Worker. Starting a new run terminates the previous
 * worker, so there is never more than one simulation in flight. The last result stays
 * available while a new one is computed (charts dim instead of disappearing).
 */
export function useExperiment(): [ExperimentState, (request: ExperimentRequest) => void] {
  const [state, setState] = useState<ExperimentState>(initial);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = useCallback((request: ExperimentRequest) => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    setState((s) => ({ ...s, status: 'running', progress: 0, error: null }));

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        setState((s) => ({ ...s, progress: message.fraction }));
        return;
      }
      if (message.type === 'result') {
        setState({
          status: 'done',
          progress: 1,
          result: message.result,
          request,
          elapsedMs: message.elapsedMs,
          error: null,
        });
      } else {
        setState((s) => ({ ...s, status: 'error', error: message.message }));
      }
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    worker.onerror = (event) => {
      setState((s) => ({ ...s, status: 'error', error: event.message || 'Simulation failed' }));
    };
    worker.postMessage(request);
  }, []);

  return [state, run];
}
