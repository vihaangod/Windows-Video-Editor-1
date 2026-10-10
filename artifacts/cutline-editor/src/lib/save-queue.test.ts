import assert from 'node:assert/strict';
import test from 'node:test';
import { createSerializedWriteQueue, retryWrite } from './save-queue.ts';

test('serialized writes run in order and do not overlap', async () => {
  const started: number[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstWrite = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const save = createSerializedWriteQueue(async (value: number) => {
    started.push(value);
    if (value === 1) await firstWrite;
  });

  const first = save(1);
  const second = save(2);
  await Promise.resolve();
  assert.deepEqual(started, [1]);

  releaseFirst?.();
  await Promise.all([first, second]);
  assert.deepEqual(started, [1, 2]);
});

test('a failed write does not prevent later snapshots from saving', async () => {
  const started: number[] = [];
  const save = createSerializedWriteQueue(async (value: number) => {
    started.push(value);
    if (value === 1) throw new Error('storage unavailable');
  });

  const first = save(1);
  const second = save(2);
  const results = await Promise.allSettled([first, second]);

  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'fulfilled');
  assert.deepEqual(started, [1, 2]);
});

test('a failed storage write is retried and resolves on success', async () => {
  let attempts = 0;
  const result = await retryWrite(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('temporary storage failure');
    return 'written';
  }, [0, 0]);

  assert.equal(result, 'written');
  assert.equal(attempts, 3);
});
