export function getExportVideoBitrate(width: number, height: number, frameRate: number) {
  return Math.round(Math.min(120_000_000, Math.max(2_000_000, width * height * frameRate * 0.08)));
}

export function getExportFrameCount(duration: number, frameRate: number) {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const safeFrameRate = Number.isFinite(frameRate) ? Math.max(1, frameRate) : 1;
  return Math.max(1, Math.ceil(safeDuration * safeFrameRate - 1e-7));
}

export function getExportProgress(completedFrames: number, totalFrames: number) {
  if (!Number.isFinite(totalFrames) || totalFrames <= 0) return 0;
  const completed = Number.isFinite(completedFrames) ? Math.max(0, completedFrames) : 0;
  return Math.max(0, Math.min(99, Math.floor((completed / totalFrames) * 100)));
}

export function sanitizeExportBaseName(value: string) {
  const withoutExtension = value.trim().replace(/\.(mp4|webm)$/i, '');
  const safe = withoutExtension
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 120)
    .replace(/[. ]+$/g, '')
    .trim();
  if (!safe) return 'cutline-export';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) return `_${safe}`;
  return safe;
}

export function getUniqueExportBaseName(
  requestedBaseName: string,
  extension: 'mp4' | 'webm',
  usedFilenames: Iterable<string>,
) {
  const used = new Set(Array.from(usedFilenames, (filename) => filename.toLowerCase()));
  const baseName = sanitizeExportBaseName(requestedBaseName);
  let candidate = baseName;
  let suffix = 2;
  while (used.has(`${candidate}.${extension}`.toLowerCase())) {
    candidate = `${baseName}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
