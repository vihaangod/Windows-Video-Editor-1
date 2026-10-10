export const MIN_TIMELINE_ZOOM = 0.125;
export const MAX_TIMELINE_ZOOM = 4;
export const INITIAL_TIMELINE_SECONDS = 30;
export const TIMELINE_TICK_TARGET_PX = 80;
export const MAX_TIMELINE_TICKS = 240;

const NICE_INTERVALS = [
  1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800,
  21600, 43200, 86400,
];

export function getTimelineEnd(contentEnd: number) {
  const safeContentEnd = Number.isFinite(contentEnd) ? Math.max(0, contentEnd) : 0;
  return Math.max(INITIAL_TIMELINE_SECONDS, safeContentEnd + 3);
}

export function getTimelineTickInterval(duration: number, pixelsPerSecond: number) {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const safeScale = Number.isFinite(pixelsPerSecond) ? Math.max(0.01, pixelsPerSecond) : 0.01;
  const desiredInterval = Math.max(
    TIMELINE_TICK_TARGET_PX / safeScale,
    Math.max(1, safeDuration) / MAX_TIMELINE_TICKS,
  );
  return NICE_INTERVALS.find((interval) => interval >= desiredInterval) ??
    Math.ceil(desiredInterval / 86400) * 86400;
}

export function getTimelineRuler(duration: number, pixelsPerSecond: number) {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const interval = getTimelineTickInterval(safeDuration, pixelsPerSecond);
  const tickCount = Math.floor(safeDuration / interval) + 1;
  return {
    interval,
    ticks: Array.from({ length: tickCount }, (_, index) => index * interval),
  };
}

export function formatTimelineTick(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function adjustTimelineZoom(currentZoom: number, direction: -1 | 1) {
  const safeZoom = Number.isFinite(currentZoom) ? currentZoom : 1;
  const factor = direction > 0 ? 1.25 : 0.8;
  const nextZoom = Math.max(MIN_TIMELINE_ZOOM, Math.min(MAX_TIMELINE_ZOOM, safeZoom * factor));
  return Math.round(nextZoom * 10000) / 10000;
}
