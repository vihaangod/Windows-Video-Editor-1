const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const {
  buildRichPresenceActivity,
  createRichPresenceController,
  normalizeRichPresenceInput,
} = require('./rich-presence.cjs');

const CLIENT_ID = '123456789012345678';

class MockRpcClient extends EventEmitter {
  constructor() {
    super();
    this.loginCalls = [];
    this.activityCalls = [];
    this.clearCalls = 0;
    this.destroyCalls = 0;
  }

  async login(options) {
    this.loginCalls.push(options);
    await Promise.resolve();
    this.emit('ready');
  }

  async setActivity(activity) {
    this.activityCalls.push(activity);
  }

  async clearActivity() {
    this.clearCalls += 1;
  }

  destroy() {
    this.destroyCalls += 1;
  }
}

function createHarness(options = {}) {
  const clients = [];
  const statuses = [];
  let currentTime = 1_800_000_000_000;
  const controller = createRichPresenceController({
    createClient: () => {
      const client = new MockRpcClient();
      clients.push(client);
      return client;
    },
    onStatus: (status) => statuses.push(status),
    now: () => currentTime,
    reconnectDelayMs: 5,
    schedule: (callback) => {
      const timer = setTimeout(callback, 5);
      timer.unref();
      return timer;
    },
    cancelSchedule: clearTimeout,
    ...options,
  });
  return {
    controller,
    clients,
    statuses,
    setTime(value) { currentTime = value; },
  };
}

test('presence input validates IDs, hides project names by default and strips path data', () => {
  const defaults = normalizeRichPresenceInput({
    enabled: true,
    clientId: CLIENT_ID,
    projectName: 'Private project',
  });
  assert.equal(defaults.projectName, '');

  const shared = normalizeRichPresenceInput({
    enabled: true,
    clientId: CLIENT_ID,
    shareProjectName: true,
    projectName: '  Level One\\secret.mp4  ',
    imageKey: 'cutline_icon',
    workflow: 'exporting',
  });
  assert.equal(shared.projectName, 'Level One secret.mp4');
  assert.equal(shared.imageKey, 'cutline_icon');
  assert.equal(shared.workflow, 'exporting');
  assert.equal(normalizeRichPresenceInput({ enabled: true, clientId: 'not-an-id' }).clientId, '');
  assert.equal(normalizeRichPresenceInput({ imageKey: '../../path' }).imageKey, '');
});

test('activity describes editing, exporting and media library states with an accurate elapsed start', () => {
  const startedAt = 1_800_000_000_000;
  const editing = normalizeRichPresenceInput({ workflow: 'editing' });
  assert.deepEqual(buildRichPresenceActivity(editing, startedAt), {
    details: 'Editing a video',
    startTimestamp: new Date(startedAt),
    instance: false,
  });
  assert.equal(buildRichPresenceActivity({ ...editing, workflow: 'exporting' }, startedAt).details, 'Exporting a video');
  assert.equal(buildRichPresenceActivity({ ...editing, workflow: 'media-library' }, startedAt).details, 'Browsing the media library');
});

test('Discord asset names are omitted by default and included only when a valid key is configured', () => {
  const startedAt = 1_800_000_000_000;
  const privateActivity = buildRichPresenceActivity(normalizeRichPresenceInput({
    imageKey: 'cutline_icon',
    projectName: 'Private project',
  }), startedAt);
  assert.equal(privateActivity.largeImageKey, 'cutline_icon');
  assert.equal(privateActivity.state, undefined);

  const defaultActivity = buildRichPresenceActivity(normalizeRichPresenceInput(null), startedAt);
  assert.equal(defaultActivity.largeImageKey, undefined);
  assert.equal(privateActivity.largeImageText, 'Cutline video editor');
});

test('disabled preference never connects; enabling and disabling controls publishing', async () => {
  const { controller, clients } = createHarness();
  assert.equal(controller.update({ enabled: false, clientId: CLIENT_ID }), 'disabled');
  assert.equal(clients.length, 0);

  assert.equal(controller.update({ enabled: true, clientId: CLIENT_ID, workflow: 'editing' }), 'connecting');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clients.length, 1);
  assert.deepEqual(clients[0].loginCalls, [{ clientId: CLIENT_ID }]);
  assert.equal(clients[0].activityCalls[0].details, 'Editing a video');
  assert.equal(controller.update({ enabled: false, clientId: CLIENT_ID }), 'disabled');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clients[0].clearCalls, 1);
  assert.equal(clients[0].destroyCalls, 1);
  assert.equal(clients[0].activityCalls.length, 1);
});

test('export and project-sharing updates publish only meaningful, privacy-safe changes', async () => {
  const { controller, clients, setTime } = createHarness();
  controller.update({ enabled: true, clientId: CLIENT_ID, workflow: 'editing', projectName: 'secret.mp4' });
  await new Promise((resolve) => setImmediate(resolve));
  const client = clients[0];
  assert.equal(client.activityCalls.length, 1);
  assert.equal(client.activityCalls[0].state, undefined);

  setTime(1_800_000_010_000);
  controller.update({
    enabled: true,
    clientId: CLIENT_ID,
    workflow: 'exporting',
    shareProjectName: true,
    projectName: 'cut-01',
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.activityCalls.length, 2);
  assert.equal(client.activityCalls[1].details, 'Exporting a video');
  assert.equal(client.activityCalls[1].state, 'Project: cut-01');
  assert.equal(client.activityCalls[1].startTimestamp.getTime(), 1_800_000_010_000);

  controller.update({
    enabled: true,
    clientId: CLIENT_ID,
    workflow: 'exporting',
    shareProjectName: true,
    projectName: 'cut-01',
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.activityCalls.length, 2);
  controller.shutdown();
});

test('missing Discord app ID and connection failures are non-fatal and can be retried', async () => {
  const clients = [];
  let scheduled = null;
  const controller = createRichPresenceController({
    createClient: () => {
      const client = new MockRpcClient();
      clients.push(client);
      if (clients.length === 1) {
        client.login = async () => { throw new Error('Discord is not running'); };
      }
      return client;
    },
    schedule: (callback) => { scheduled = callback; return 1; },
    cancelSchedule: () => { scheduled = null; },
    reconnectDelayMs: 10,
  });

  assert.equal(controller.update({ enabled: true }), 'needs-setup');
  assert.equal(clients.length, 0);
  controller.update({ enabled: true, clientId: CLIENT_ID });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getStatus(), 'unavailable');
  assert.equal(typeof scheduled, 'function');
  const retry = scheduled;
  scheduled = null;
  retry();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clients.length, 2);
  assert.equal(controller.getStatus(), 'connected');
  controller.shutdown();
});

test('an RPC disconnect stays non-fatal and reconnects after the configured delay', async () => {
  let retry = null;
  const { controller, clients, statuses } = createHarness({
    schedule: (callback) => { retry = callback; return 1; },
    cancelSchedule: () => { retry = null; },
  });
  controller.update({ enabled: true, clientId: CLIENT_ID });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getStatus(), 'connected');

  clients[0].emit('disconnected');
  assert.equal(controller.getStatus(), 'unavailable');
  assert.equal(clients[0].destroyCalls, 1);
  assert.equal(typeof retry, 'function');
  assert.ok(statuses.includes('unavailable'));

  const reconnect = retry;
  retry = null;
  reconnect();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(clients.length, 2);
  assert.equal(controller.getStatus(), 'connected');
  controller.shutdown();
});

test('shutdown disconnects and clears presence cleanly', async () => {
  const { controller, clients } = createHarness();
  controller.update({ enabled: true, clientId: CLIENT_ID });
  await new Promise((resolve) => setImmediate(resolve));
  controller.shutdown();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.getStatus(), 'disabled');
  assert.equal(clients[0].clearCalls, 1);
  assert.equal(clients[0].destroyCalls, 1);
});
