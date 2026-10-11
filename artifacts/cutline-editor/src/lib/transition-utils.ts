import type { Clip, ClipTransition, Project } from './composition.ts';

export type TransitionMode = 'entrance' | 'exit' | 'between';
export type TransitionDirection = 'left' | 'right' | 'up' | 'down';
export type TransitionRange = {
  start: number;
  end: number;
  duration: number;
  anchor: number;
  mode: TransitionMode;
  clipIds: string[];
};

const MIN_TRANSITION_DURATION = 0.1;
const MAX_TRANSITION_DURATION = 4;

export function getTransitionMode(transition: ClipTransition): TransitionMode {
  return transition.mode === 'entrance' || transition.mode === 'exit' || transition.mode === 'between'
    ? transition.mode
    : 'between';
}

export function getTransitionDirection(transition: ClipTransition): TransitionDirection {
  return transition.direction === 'left' || transition.direction === 'right' ||
    transition.direction === 'up' || transition.direction === 'down'
    ? transition.direction
    : 'right';
}

export function getTransitionTargetClipId(transition: ClipTransition): string {
  if (transition.targetClipId) return transition.targetClipId;
  return getTransitionMode(transition) === 'exit' ? transition.fromClipId : transition.toClipId;
}

function clipDuration(clip: Clip): number {
  return Math.max(0, (clip.sourceOut - clip.sourceIn) / Math.max(0.1, clip.speed));
}

function isVideoClip(project: Project, clip: Clip | undefined): clip is Clip {
  return Boolean(
    clip && !clip.text && !clip.audioOnly && !clip.filterEffect &&
    ['video', 'overlay'].includes(project.tracks.find((track) => track.id === clip.trackId)?.kind || ''),
  );
}

function shareTransitionEdge(first: ClipTransition, second: ClipTransition): boolean {
  const firstMode = getTransitionMode(first);
  const secondMode = getTransitionMode(second);
  if (firstMode === 'between' && secondMode === 'between') {
    return first.fromClipId === second.fromClipId && first.toClipId === second.toClipId;
  }
  if (firstMode === 'between') {
    const targetId = getTransitionTargetClipId(second);
    return secondMode === 'exit' ? targetId === first.fromClipId : targetId === first.toClipId;
  }
  if (secondMode === 'between') {
    const targetId = getTransitionTargetClipId(first);
    return firstMode === 'exit' ? targetId === second.fromClipId : targetId === second.toClipId;
  }
  return firstMode === secondMode && getTransitionTargetClipId(first) === getTransitionTargetClipId(second);
}

function touchesAnyClip(transition: ClipTransition, clipIds: Set<string>): boolean {
  return clipIds.has(transition.fromClipId) || clipIds.has(transition.toClipId) ||
    clipIds.has(getTransitionTargetClipId(transition));
}

export function getTransitionTimelineRange(project: Project, transition: ClipTransition): TransitionRange | null {
  const mode = getTransitionMode(transition);
  if ((project.transitions || []).some((other) => other.id !== transition.id && shareTransitionEdge(transition, other))) return null;
  let clipIds: string[];
  let anchor: number;
  let maximumDuration: number;

  if (mode === 'between') {
    const fromClip = project.clips.find((clip) => clip.id === transition.fromClipId);
    const toClip = project.clips.find((clip) => clip.id === transition.toClipId);
    if (!isVideoClip(project, fromClip) || !isVideoClip(project, toClip) || fromClip.trackId !== toClip.trackId) return null;
    const fromEnd = fromClip.timelineStart + clipDuration(fromClip);
    if (Math.abs(fromEnd - toClip.timelineStart) > 0.05) return null;
    anchor = (fromEnd + toClip.timelineStart) / 2;
    const shorterClip = Math.min(clipDuration(fromClip), clipDuration(toClip));
    const sharedClips = new Set([fromClip.id, toClip.id]);
    const hasOtherTransition = (project.transitions || []).some((item) =>
      item.id !== transition.id && touchesAnyClip(item, sharedClips),
    );
    maximumDuration = hasOtherTransition ? shorterClip / 2 : shorterClip;
    clipIds = [fromClip.id, toClip.id];
  } else {
    const targetId = getTransitionTargetClipId(transition);
    const targetClip = project.clips.find((clip) => clip.id === targetId);
    if (!isVideoClip(project, targetClip)) return null;
    const targetDuration = clipDuration(targetClip);
    const hasOtherTransition = (project.transitions || []).some((item) =>
      item.id !== transition.id &&
      touchesAnyClip(item, new Set([targetClip.id])),
    );
    maximumDuration = hasOtherTransition ? targetDuration / 2 : targetDuration;
    anchor = mode === 'entrance' ? targetClip.timelineStart : targetClip.timelineStart + targetDuration;
    clipIds = [targetClip.id];
  }

  const duration = Math.min(
    MAX_TRANSITION_DURATION,
    maximumDuration,
    Math.max(MIN_TRANSITION_DURATION, Number.isFinite(transition.duration) ? transition.duration : MIN_TRANSITION_DURATION),
  );
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const start = mode === 'between'
    ? anchor - duration / 2
    : mode === 'entrance'
      ? anchor
      : anchor - duration;
  return { start, end: start + duration, duration, anchor, mode, clipIds };
}
