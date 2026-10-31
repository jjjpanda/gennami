import { Worker } from 'node:worker_threads';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';

const workerBootstrap = `
const { parentPort } = require('node:worker_threads');
globalThis.self = {
  postMessage: (m, t) => parentPort.postMessage(m, t)
};
parentPort.on('message', data => self.onmessage({ data }));
import(${JSON.stringify(new URL('../src/worker.js', import.meta.url).href)}).then(() => {
  parentPort.postMessage({ type: 'ready' });
});
`;

const worker = new Worker(workerBootstrap, { eval: true });

function waitForMessage() {
  return new Promise((resolve, reject) => {
    const onMessage = msg => {
      worker.off('error', onError);
      resolve(msg);
    };
    const onError = err => {
      worker.off('message', onMessage);
      reject(err);
    };
    worker.once('message', onMessage);
    worker.once('error', onError);
  });
}

async function send(data) {
  const pending = waitForMessage();
  worker.postMessage(data);
  const msg = await pending;
  if (msg.type === 'error') {
    throw new Error(msg.message);
  }
  return msg.frame;
}

const results = [];
try {
  await waitForMessage();

  const configs = [
    { label: 'primordial-soup', preset: 'primordial-soup', population: 54 },
    { label: 'soliton-collider', preset: 'soliton-collider', population: 48 }
  ];

  for (const config of configs) {
    let frame = await send({ type: 'init', settings: config, generation: 1 });
    const times = [];
    const started = performance.now();
    const initialStep = frame.stepIndex;

    for (let i = 0; i < 40; i++) {
      frame = await send({ type: 'advance', steps: 4, generation: 1 });
      times.push(frame.workerMs);
    }

    const elapsed = (performance.now() - started) / 1000;
    const totalSteps = frame.stepIndex - initialStep;
    times.sort((a, b) => a - b);

    results.push({
      ...config,
      elapsedSeconds: elapsed,
      steps: totalSteps,
      stepsPerSecond: totalSteps / elapsed,
      workerP95Ms: times[Math.floor(times.length * 0.95)],
      interactions: frame.metrics.interactions
    });
  }
} finally {
  await worker.terminate();
}

const report = {
  date: new Date().toISOString(),
  runtime: process.version,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  results
};

await mkdir('.artifacts', { recursive: true });
await writeFile('.artifacts/throughput.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
