import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { createSimulation } from '../src/engine.js';
import { mkdir, writeFile } from 'node:fs/promises';

const percentile = (arr, q) => [...arr].sort((a, b) => a - b)[Math.floor((arr.length - 1) * q)];

const results = {
  date: new Date().toISOString(),
  runtime: process.version,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  platform: os.platform(),
  results: []
};

for (const n of [64, 128]) {
  for (const population of [36, 72]) {
    const sim = createSimulation({ n, population });
    const times = [];

    for (let j = 0; j < 60; j++) {
      const t = performance.now();
      sim.step(1);
      if (j >= 10) {
        times.push(performance.now() - t);
      }
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    results.results.push({
      n,
      population,
      p50StepMs: percentile(times, 0.5),
      p95StepMs: percentile(times, 0.95),
      stepsPerSecond: 1000 / avgTime,
      heapMiB: process.memoryUsage().heapUsed / 1048576
    });
  }
}

await mkdir('.artifacts', { recursive: true });
await writeFile('.artifacts/benchmark.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
