import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjustTimelineZoom,
  formatTimelineTick,
  getTimelineEnd,
  getTimelineRuler,
  MAX_TIMELINE_ZOOM,
  MIN_TIMELINE_ZOOM,
} from './timeline-geometry.ts';

test('timeline stays content-driven for ten-minute and beyond-thirty-minute clips', () => {
  assert.equal(getTimelineEnd(10 * 60), 603);
  assert.equal(getTimelineEnd(30 * 60 + 12), 1815);
  assert.equal(getTimelineEnd(4 * 60 * 60 + 2), 14405);
});

test('long-project rulers stay sparse and aligned to useful intervals', () => {
  for (const duration of [10 * 60, 35 * 60, 4 * 60 * 60]) {
    const ruler = getTimelineRuler(duration, 16);
    assert.ok(ruler.ticks.length <= 241);
    assert.equal(ruler.ticks[0], 0);
    assert.ok(ruler.ticks.every((tick, index) => index === 0 || tick > ruler.ticks[index - 1]));
    assert.ok(ruler.ticks.every((tick) => tick <= duration));
  }
  assert.equal(formatTimelineTick(3600), '01:00:00');
  assert.equal(formatTimelineTick(3665), '01:01:05');
  assert.equal(formatTimelineTick(125), '02:05');
});

test('timeline zoom reaches wide and close views without exceeding its bounds', () => {
  assert.equal(adjustTimelineZoom(1, -1), 0.8);
  assert.equal(adjustTimelineZoom(MIN_TIMELINE_ZOOM, -1), MIN_TIMELINE_ZOOM);
  assert.equal(adjustTimelineZoom(MAX_TIMELINE_ZOOM, 1), MAX_TIMELINE_ZOOM);
  assert.ok(adjustTimelineZoom(1, 1) > 1);
});
