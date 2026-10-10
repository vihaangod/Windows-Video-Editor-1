import assert from 'node:assert/strict';
import test from 'node:test';
import { getPreviewCanvasSize, renderProjectFrame, type Project } from './composition.ts';

function createContext(width: number, height: number) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const context = {
    canvas: { width, height },
    save: () => calls.push({ name: 'save', args: [] }),
    restore: () => calls.push({ name: 'restore', args: [] }),
    setTransform: (...args: number[]) => calls.push({ name: 'setTransform', args }),
    clearRect: (...args: number[]) => calls.push({ name: 'clearRect', args }),
    fillRect: (...args: number[]) => calls.push({ name: 'fillRect', args }),
    measureText: (text: string) => ({ width: text.length * 22 }),
    translate: (...args: number[]) => calls.push({ name: 'translate', args }),
    rotate: (...args: number[]) => calls.push({ name: 'rotate', args }),
    scale: (...args: number[]) => calls.push({ name: 'scale', args }),
    fillText: (...args: unknown[]) => calls.push({ name: 'fillText', args }),
  } as unknown as CanvasRenderingContext2D;

  return { context, calls };
}

function textProject(): Project {
  return {
    id: 'project-1',
    name: 'Overlay test',
    width: 3840,
    height: 2160,
    frameRate: 60,
    tracks: [{ id: 'text-track', name: 'Text 1', kind: 'text', order: 0, muted: false, visible: true, locked: false }],
    clips: [{
      id: 'title-1',
      trackId: 'text-track',
      timelineStart: 0,
      sourceIn: 0,
      sourceOut: 4,
      volume: 0,
      speed: 1,
      text: {
        templateId: 'plain',
        templateName: 'Plain',
        content: 'Independent title layer',
        fontFamily: 'sans-serif',
        fontSize: 72,
        fontWeight: 500,
        color: '#ffffff',
        align: 'center',
        x: .5,
        y: .5,
        backgroundColor: '',
        outlineColor: '#000000',
        outlineWidth: 0,
        shadow: false,
        opacity: 1,
      },
    }],
  };
}

test('preview backing stores preserve 1080p and cap 4K dimensions without changing project settings', () => {
  assert.deepEqual(getPreviewCanvasSize(1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(getPreviewCanvasSize(3840, 2160), { width: 1920, height: 1080 });
  assert.deepEqual(getPreviewCanvasSize(7680, 4320), { width: 1920, height: 1080 });
  assert.equal(textProject().frameRate, 60);
});

test('base and transparent overlay render independently at scaled preview resolution', () => {
  const project = textProject();
  const base = createContext(1920, 1080);
  const overlay = createContext(1920, 1080);

  renderProjectFrame(base.context, project, [], new Map(), 1, true, null, null, undefined, { layer: 'base' });
  renderProjectFrame(overlay.context, project, [], new Map(), 1, true, null, null, undefined, { layer: 'overlay' });

  assert.ok(base.calls.some((call) => call.name === 'fillRect'), 'video base gets an opaque background');
  assert.ok(!base.calls.some((call) => call.name === 'fillText'), 'text is not painted into the video base');
  assert.ok(overlay.calls.some((call) => call.name === 'clearRect'), 'overlay is cleared independently');
  assert.ok(overlay.calls.some((call) => call.name === 'fillText'), 'text is rendered on the transparent overlay');
  assert.ok(overlay.calls.some((call) => call.name === 'setTransform' && call.args[0] === .5 && call.args[3] === .5), '4K project coordinates scale to the preview backing store');
});

test('default rendering still composites text for full-resolution exports', () => {
  const { context, calls } = createContext(3840, 2160);
  renderProjectFrame(context, textProject(), [], new Map(), 1, false);
  assert.ok(calls.some((call) => call.name === 'fillRect'));
  assert.ok(calls.some((call) => call.name === 'fillText'));
});
