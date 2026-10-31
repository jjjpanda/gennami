export class WorkerClient {
  constructor(onFrame, onError) {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.generation = 0;
    this.pending = 0;
    this.sequence = 0;
    this.requests = new Map();
    this.onError = onError;

    this.worker.onmessage = ({ data }) => {
      if (data.type === 'snapshot') {
        const request = this.requests.get(data.id);
        this.requests.delete(data.id);
        request?.resolve(data.snapshot);
        return;
      }

      if (data.type === 'error') {
        this.fail(new Error(data.message));
        return;
      }

      if (data.generation !== this.generation) {
        return;
      }

      this.pending = Math.max(0, this.pending - 1);
      onFrame(data.frame);
    };

    this.worker.onerror = event => this.fail(new Error(event.message || 'Worker error'));
  }

  rejectAll(error) {
    for (const request of this.requests.values()) {
      request.reject(error);
    }
    this.requests.clear();
  }

  fail(error) {
    this.pending = 0;
    this.rejectAll(error);
    this.onError?.(error);
  }

  get busy() {
    return this.pending > 0;
  }

  restart(type, data = {}) {
    this.generation++;
    this.pending = 0;
    this.send(type, data);
  }

  send(type, data = {}) {
    this.pending++;
    this.worker.postMessage({ type, generation: this.generation, ...data });
  }

  snapshot() {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.requests.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'snapshot', id });
    });
  }

  dispose() {
    this.worker.terminate();
    this.rejectAll(new Error('Component disconnected'));
  }
}
