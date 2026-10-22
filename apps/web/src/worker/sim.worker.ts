// Runs simulations off the main thread so the UI stays responsive.
import { driftExperiment, type ExperimentResult, sweepExperiment } from '@plant-evo/sim';
import type { ExperimentRequest, WorkerMessage } from './protocol.ts';

// The project compiles against the DOM lib; describe just the worker-scope members used here.
const scope = self as unknown as {
  postMessage(message: WorkerMessage): void;
  onmessage: ((event: MessageEvent<ExperimentRequest>) => void) | null;
};

function post(message: WorkerMessage): void {
  scope.postMessage(message);
}

scope.onmessage = (event: MessageEvent<ExperimentRequest>) => {
  const started = performance.now();
  let reported = 0;
  const onProgress = (fraction: number) => {
    // Throttle to whole percentage points.
    if (fraction - reported >= 0.01 || fraction === 1) {
      reported = fraction;
      post({ type: 'progress', fraction });
    }
  };
  try {
    const request = event.data;
    let result: ExperimentResult;
    switch (request.kind) {
      case 'drift':
        result = driftExperiment(request.options, onProgress);
        break;
      case 'sweep':
        result = sweepExperiment(request.options, onProgress);
        break;
    }
    post({ type: 'result', result, elapsedMs: performance.now() - started });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
