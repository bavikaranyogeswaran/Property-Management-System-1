/**
 * fetchQueue.ts
 *
 * A lightweight sequential fetch queue designed to prevent request storms
 * when multiple context providers initialize simultaneously on app boot.
 *
 * Instead of firing N requests in parallel, each enqueued fetch runs
 * only after the previous one completes, with a configurable stagger
 * delay between them.
 *
 * Usage:
 *   import { enqueueFetch } from '../../utils/fetchQueue';
 *
 *   // In a useEffect inside a context provider:
 *   enqueueFetch(() => fetchMyData());
 */

type FetchTask = () => Promise<void>;

interface QueueEntry {
  task: FetchTask;
  resolve: () => void;
  reject: (err: unknown) => void;
}

const STAGGER_DELAY_MS = 80; // ms gap between sequential requests

let queue: QueueEntry[] = [];
let isRunning = false;

async function processQueue() {
  if (isRunning) return;
  isRunning = true;

  try {
    while (queue.length > 0) {
      const entry = queue.shift()!;
      if (!entry) continue; // Safety check

      const taskName = entry.task.name || 'Anonymous Task';

      try {
        await entry.task();
        entry.resolve();
      } catch (err) {
        entry.reject(err);
      }

      // Stagger: small delay between requests to avoid bursting the rate limiter
      if (queue.length > 0) {
        await new Promise((res) => setTimeout(res, STAGGER_DELAY_MS));
      }
    }
  } finally {
    isRunning = false;

    // [RACE CONDITION FIX] Check if anything was added while we were cleaning up
    if (queue.length > 0) {
      processQueue();
    }
  }
}

/**
 * Enqueue a fetch task. Returns a promise that resolves when the task
 * has completed (or rejects if it throws).
 */
export function enqueueFetch(task: FetchTask): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    queue.push({ task, resolve, reject });
    processQueue();
  });
}

/**
 * Reset the queue (useful for testing or on logout).
 */
export function resetFetchQueue() {
  queue = [];
  isRunning = false;
}
