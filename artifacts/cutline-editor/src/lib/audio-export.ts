import { getAudioFade, getClipDuration, type Clip } from './composition.ts';

export type DecodedAudioBuffer = {
  timestamp: number;
  duration: number;
  buffer: {
    sampleRate: number;
    numberOfChannels: number;
    length: number;
    getChannelData(channel: number): Float32Array;
  };
};

export type AudioClipBuffers = {
  clip: Clip;
  buffers: readonly DecodedAudioBuffer[];
};

export type MixedAudioChunk = {
  timestamp: number;
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: 2;
  data: Float32Array;
};

function sampleAt(
  buffers: readonly DecodedAudioBuffer[],
  bufferIndex: number,
  time: number,
  channel: number,
): { value: number; bufferIndex: number } {
  let index = bufferIndex;
  while (index < buffers.length) {
    const buffer = buffers[index]!;
    const bufferEnd = buffer.timestamp + buffer.duration;
    if (time < buffer.timestamp) return { value: 0, bufferIndex: index };
    if (time < bufferEnd) {
      const position = (time - buffer.timestamp) * buffer.buffer.sampleRate;
      const firstFrame = Math.floor(position);
      if (firstFrame < 0 || firstFrame >= buffer.buffer.length) return { value: 0, bufferIndex: index };
      const channelData = buffer.buffer.getChannelData(Math.min(channel, buffer.buffer.numberOfChannels - 1));
      const first = channelData[firstFrame] ?? 0;
      const second = channelData[Math.min(firstFrame + 1, buffer.buffer.length - 1)] ?? first;
      const fraction = position - firstFrame;
      return { value: first + (second - first) * fraction, bufferIndex: index };
    }
    index += 1;
  }
  return { value: 0, bufferIndex: index };
}

/**
 * Mixes decoded source buffers at project timestamps. It deliberately has no
 * dependency on wall-clock playback or video encoder speed.
 */
export function mixAudioTimelineChunk(
  timestamp: number,
  duration: number,
  clips: readonly AudioClipBuffers[],
  sampleRate = 48_000,
): MixedAudioChunk {
  const safeTimestamp = Number.isFinite(timestamp) ? Math.max(0, timestamp) : 0;
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const safeSampleRate = Number.isFinite(sampleRate) ? Math.max(1, Math.round(sampleRate)) : 48_000;
  const numberOfFrames = Math.max(0, Math.round(safeDuration * safeSampleRate));
  const left = new Float32Array(numberOfFrames);
  const right = new Float32Array(numberOfFrames);
  const chunkEnd = safeTimestamp + safeDuration;

  for (const { clip, buffers } of clips) {
    if (!buffers.length || !Number.isFinite(clip.speed) || clip.speed <= 0) continue;
    const clipEnd = clip.timelineStart + getClipDuration(clip);
    const activeStart = Math.max(safeTimestamp, clip.timelineStart);
    const activeEnd = Math.min(chunkEnd, clipEnd);
    if (activeEnd <= activeStart) continue;

    const firstFrame = Math.max(0, Math.ceil((activeStart - safeTimestamp) * safeSampleRate - 1e-7));
    const endFrame = Math.min(numberOfFrames, Math.ceil((activeEnd - safeTimestamp) * safeSampleRate - 1e-7));
    const volume = Number.isFinite(clip.volume) ? Math.max(0, clip.volume) : 1;
    let bufferIndex = 0;

    for (let frame = firstFrame; frame < endFrame; frame += 1) {
      const timelineTime = safeTimestamp + frame / safeSampleRate;
      const sourceTime = clip.sourceIn + (timelineTime - clip.timelineStart) * clip.speed;
      const leftSample = sampleAt(buffers, bufferIndex, sourceTime, 0);
      bufferIndex = leftSample.bufferIndex;
      const rightSample = sampleAt(buffers, bufferIndex, sourceTime, 1);
      bufferIndex = rightSample.bufferIndex;
      const gain = volume * getAudioFade(clip, timelineTime);
      left[frame] = (left[frame] ?? 0) + leftSample.value * gain;
      right[frame] = (right[frame] ?? 0) + rightSample.value * gain;
    }
  }

  const data = new Float32Array(numberOfFrames * 2);
  for (let frame = 0; frame < numberOfFrames; frame += 1) {
    data[frame] = Math.max(-1, Math.min(1, left[frame] ?? 0));
    data[numberOfFrames + frame] = Math.max(-1, Math.min(1, right[frame] ?? 0));
  }

  return {
    timestamp: safeTimestamp,
    sampleRate: safeSampleRate,
    numberOfFrames,
    numberOfChannels: 2,
    data,
  };
}
