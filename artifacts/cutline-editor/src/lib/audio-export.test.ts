import assert from 'node:assert/strict';
import test from 'node:test';
import { mixAudioTimelineChunk, type DecodedAudioBuffer } from './audio-export.ts';
import type { Clip } from './composition.ts';

const SAMPLE_RATE = 1;

function clip(patch: Partial<Clip> = {}): Clip {
  return {
    id: 'clip',
    trackId: 'audio',
    timelineStart: 0,
    sourceIn: 0,
    sourceOut: 2,
    volume: 1,
    speed: 1,
    ...patch,
  };
}

function decodedBuffer(timestamp: number, samples: number[], right = samples, sampleRate = SAMPLE_RATE): DecodedAudioBuffer {
  const channels = [Float32Array.from(samples), Float32Array.from(right)];
  return {
    timestamp,
    duration: samples.length / sampleRate,
    buffer: {
      sampleRate,
      numberOfChannels: 2,
      length: samples.length,
      getChannelData(channel) {
        return channels[channel]!;
      },
    },
  };
}

function left(chunk: ReturnType<typeof mixAudioTimelineChunk>) {
  return chunk.data.subarray(0, chunk.numberOfFrames);
}

function right(chunk: ReturnType<typeof mixAudioTimelineChunk>) {
  return chunk.data.subarray(chunk.numberOfFrames);
}

test('18.114 seconds of continuous audio stays continuous and ends on the project timestamp', () => {
  const source = decodedBuffer(0, Array(18_114).fill(0.25), undefined, 1_000);
  const chunk = mixAudioTimelineChunk(0, 18.114, [{ clip: clip({ sourceOut: 18.114 }), buffers: [source] }], 1_000);

  assert.equal(chunk.numberOfFrames, 18_114);
  assert.equal(chunk.timestamp + chunk.numberOfFrames / chunk.sampleRate, 18.114);
  assert.ok(left(chunk).every((sample) => Math.abs(sample - 0.25) < 1e-6), 'the tone has no gaps or level changes');
  assert.ok(right(chunk).every((sample) => Math.abs(sample - 0.25) < 1e-6));
});

test('adjacent clips remain continuous when their timeline and source trims meet', () => {
  const first = decodedBuffer(0, [0.2, 0.2, 0.2, 0.2]);
  const second = decodedBuffer(3, [0.6, 0.6, 0.6, 0.6]);
  const chunk = mixAudioTimelineChunk(0, 4, [
    { clip: clip({ sourceOut: 2 }), buffers: [first] },
    { clip: clip({ id: 'next', timelineStart: 2, sourceIn: 3, sourceOut: 5 }), buffers: [second] },
  ], 1);

  assert.ok([...left(chunk)].every((sample, index) => Math.abs(sample - [0.2, 0.2, 0.6, 0.6][index]!) < 1e-6));
});

test('trimmed clips start at the requested source offset and leave earlier timeline positions silent', () => {
  const source = decodedBuffer(0, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  const chunk = mixAudioTimelineChunk(0, 5, [{
    clip: clip({ timelineStart: 2, sourceIn: 3, sourceOut: 5 }),
    buffers: [source],
  }], 1);

  assert.ok([...left(chunk)].every((sample, index) => Math.abs(sample - [0, 0, 0.4, 0.5, 0][index]!) < 1e-6));
});

test('split clips preserve their non-zero timeline positions and source offsets', () => {
  const source = decodedBuffer(0, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  const chunk = mixAudioTimelineChunk(0, 6, [
    { clip: clip({ id: 'split-a', timelineStart: 1, sourceIn: 1, sourceOut: 2 }), buffers: [source] },
    { clip: clip({ id: 'split-b', timelineStart: 4, sourceIn: 4, sourceOut: 5 }), buffers: [source] },
  ], 1);

  assert.ok([...left(chunk)].every((sample, index) => Math.abs(sample - [0, 0.2, 0, 0, 0.5, 0][index]!) < 1e-6));
});

test('overlapping audio clips mix together on both output channels', () => {
  const chunk = mixAudioTimelineChunk(0, 2, [
    { clip: clip({ id: 'bed', sourceOut: 2, volume: 0.5 }), buffers: [decodedBuffer(0, [0.4, 0.4], [0.2, 0.2])] },
    { clip: clip({ id: 'overlay', sourceOut: 2, volume: 0.25 }), buffers: [decodedBuffer(0, [0.8, 0.8], [0.4, 0.4])] },
  ], 1);

  assert.ok([...left(chunk)].every((sample) => Math.abs(sample - 0.4) < 1e-6));
  assert.ok([...right(chunk)].every((sample) => Math.abs(sample - 0.2) < 1e-6));
});
