const DEFAULT_RECONNECT_DELAY_MS = 30_000;
const DISCORD_CLIENT_ID_PATTERN = /^\d{17,20}$/;
const DISCORD_IMAGE_KEY_PATTERN = /^[a-z\d][a-z\d_-]{0,31}$/i;
const WORKFLOWS = new Set(['editing', 'exporting', 'media-library']);

function normalizeProjectName(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f/\\<>:"|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
}

function normalizeRichPresenceInput(value) {
  const input = value && typeof value === 'object' ? value : {};
  const clientId = typeof input.clientId === 'string' ? input.clientId.trim() : '';
  const imageKey = typeof input.imageKey === 'string' ? input.imageKey.trim() : '';
  const workflow = WORKFLOWS.has(input.workflow) ? input.workflow : 'editing';
  const shareProjectName = input.shareProjectName === true;

  return {
    enabled: input.enabled === true,
    clientId: DISCORD_CLIENT_ID_PATTERN.test(clientId) ? clientId : '',
    imageKey: DISCORD_IMAGE_KEY_PATTERN.test(imageKey) ? imageKey : '',
    shareProjectName,
    workflow,
    projectName: shareProjectName ? normalizeProjectName(input.projectName) : '',
  };
}

function buildRichPresenceActivity(input, startedAt) {
  const details = input.workflow === 'exporting'
    ? 'Exporting a video'
    : input.workflow === 'media-library'
      ? 'Browsing the media library'
      : 'Editing a video';
  const activity = {
    details,
    startTimestamp: new Date(startedAt),
    instance: false,
  };

  if (input.shareProjectName && input.projectName) {
    activity.state = `Project: ${input.projectName}`;
  }
  if (input.imageKey) {
    activity.largeImageKey = input.imageKey;
    activity.largeImageText = 'Cutline video editor';
  }
  return activity;
}

function createRichPresenceController({
  createClient,
  onStatus = () => {},
  now = Date.now,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
}) {
  let status = 'disabled';
  let preferences = normalizeRichPresenceInput(null);
  let client = null;
  let connected = false;
  let stopped = false;
  let generation = 0;
  let retryTimer = null;
  let lastActivitySignature = '';
  let activityStartedAt = 0;

  const publishStatus = (nextStatus) => {
    if (status === nextStatus) return;
    status = nextStatus;
    try {
      onStatus(status);
    } catch {
      // A window closing while a presence status is sent must not affect the editor.
    }
  };

  const cancelRetry = () => {
    if (retryTimer === null) return;
    cancelSchedule(retryTimer);
    retryTimer = null;
  };

  const destroyClient = (target, clearActivity) => {
    if (!target) return;
    const finish = () => {
      try {
        target.destroy?.();
      } catch {
        // RPC shutdown is best effort; editing must remain available.
      }
    };
    if (!clearActivity || typeof target.clearActivity !== 'function') {
      finish();
      return;
    }
    try {
      Promise.resolve(target.clearActivity()).catch(() => {}).finally(finish);
    } catch {
      finish();
    }
  };

  const detachCurrentClient = (clearActivity) => {
    generation += 1;
    connected = false;
    lastActivitySignature = '';
    const previous = client;
    client = null;
    destroyClient(previous, clearActivity);
  };

  const scheduleReconnect = () => {
    if (stopped || !preferences.enabled || retryTimer !== null) return;
    publishStatus('unavailable');
    retryTimer = schedule(() => {
      retryTimer = null;
      if (!stopped && preferences.enabled && preferences.clientId && !client) {
        connect();
      }
    }, reconnectDelayMs);
    retryTimer?.unref?.();
  };

  const publishActivity = (target, targetGeneration) => {
    if (stopped || client !== target || generation !== targetGeneration || !connected) return;
    const activity = buildRichPresenceActivity(preferences, activityStartedAt);
    const signature = JSON.stringify(activity);
    if (signature === lastActivitySignature) return;
    lastActivitySignature = signature;
    try {
      Promise.resolve(target.setActivity(activity)).catch(() => {
        if (client !== target || generation !== targetGeneration) return;
        detachCurrentClient(false);
        scheduleReconnect();
      });
    } catch {
      if (client !== target || generation !== targetGeneration) return;
      detachCurrentClient(false);
      scheduleReconnect();
    }
  };

  const connect = () => {
    if (stopped || !preferences.enabled || !preferences.clientId || client) return;
    const targetGeneration = ++generation;
    publishStatus('connecting');

    let target;
    try {
      target = createClient();
      if (!target || typeof target.login !== 'function' || typeof target.on !== 'function') {
        throw new Error('Discord RPC client is unavailable.');
      }
      client = target;
    } catch {
      scheduleReconnect();
      return;
    }

    const handleReady = () => {
      if (stopped || client !== target || generation !== targetGeneration) return;
      if (connected) return;
      connected = true;
      lastActivitySignature = '';
      publishStatus('connected');
      publishActivity(target, targetGeneration);
    };
    const handleDisconnect = () => {
      if (client !== target || generation !== targetGeneration) return;
      client = null;
      connected = false;
      lastActivitySignature = '';
      destroyClient(target, false);
      scheduleReconnect();
    };

    target.on('ready', handleReady);
    target.on('disconnected', handleDisconnect);
    try {
      Promise.resolve(target.login({ clientId: preferences.clientId })).then(handleReady).catch(() => {
        if (client !== target || generation !== targetGeneration) return;
        client = null;
        connected = false;
        destroyClient(target, false);
        scheduleReconnect();
      });
    } catch {
      if (client === target && generation === targetGeneration) {
        client = null;
        connected = false;
        destroyClient(target, false);
        scheduleReconnect();
      }
    }
  };

  const update = (value) => {
    if (stopped) return status;
    const next = normalizeRichPresenceInput(value);
    const previousIdentity = `${preferences.enabled}:${preferences.clientId}`;
    const nextIdentity = `${next.enabled}:${next.clientId}`;
    const previousActivity = JSON.stringify({
      workflow: preferences.workflow,
      projectName: preferences.projectName,
      imageKey: preferences.imageKey,
    });
    const nextActivity = JSON.stringify({
      workflow: next.workflow,
      projectName: next.projectName,
      imageKey: next.imageKey,
    });
    preferences = next;

    if (!next.enabled) {
      cancelRetry();
      detachCurrentClient(true);
      publishStatus('disabled');
      return status;
    }
    if (!next.clientId) {
      cancelRetry();
      detachCurrentClient(true);
      publishStatus('needs-setup');
      return status;
    }
    if (previousIdentity !== nextIdentity && client) {
      cancelRetry();
      detachCurrentClient(true);
    }
    if (previousActivity !== nextActivity || activityStartedAt === 0) {
      activityStartedAt = now();
      lastActivitySignature = '';
    }
    if (!client) connect();
    else if (connected) publishActivity(client, generation);
    return status;
  };

  const shutdown = () => {
    if (stopped) return;
    stopped = true;
    cancelRetry();
    detachCurrentClient(true);
    publishStatus('disabled');
  };

  return {
    update,
    shutdown,
    getStatus: () => status,
  };
}

module.exports = {
  buildRichPresenceActivity,
  createRichPresenceController,
  normalizeRichPresenceInput,
};
