import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

function createNodeWorker() {
  const bootstrap = `
    const { parentPort } = require('node:worker_threads');
    globalThis.self = {
      postMessage: (m, t) => parentPort.postMessage(m, t)
    };
    parentPort.on('message', data => self.onmessage({ data }));
    import(${JSON.stringify(new URL('../src/worker.js', import.meta.url).href)}).then(() => {
      parentPort.postMessage({ type: 'ready' });
    });
  `;
  return new Worker(bootstrap, { eval: true });
}

test('worker initializes, steps, reverses causality, and exports/restores snapshots', async () => {
  const worker = createNodeWorker();
  const nextMessage = () => new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });

  try {
    const ready = await nextMessage();
    assert.equal(ready.type, 'ready');

    worker.postMessage({
      type: 'init',
      generation: 1,
      settings: { preset: 'causal-crystal', population: 24, seed: 101 }
    });
    const initMsg = await nextMessage();
    assert.equal(initMsg.type, 'frame');
    assert.equal(initMsg.frame.entities.length, 24);

    worker.postMessage({
      type: 'advance',
      generation: 1,
      steps: 10,
      action: { active: true, mode: 'reverse', x: 0, y: 0, global: true }
    });
    const advMsg = await nextMessage();
    assert.equal(advMsg.frame.stepIndex, 10);
    assert.ok(advMsg.frame.metrics.reversals > 0);

    worker.postMessage({ type: 'snapshot', id: 7 });
    const snapMsg = await nextMessage();
    assert.equal(snapMsg.type, 'snapshot');
    assert.equal(snapMsg.id, 7);
    assert.equal(snapMsg.snapshot.stepIndex, 10);

    worker.postMessage({ type: 'restore', generation: 2, snapshot: snapMsg.snapshot });
    const restoredMsg = await nextMessage();
    assert.equal(restoredMsg.generation, 2);
    assert.equal(restoredMsg.frame.stepIndex, 10);
  } finally {
    await worker.terminate();
  }
});
