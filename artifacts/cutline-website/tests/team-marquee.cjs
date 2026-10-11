const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const chromium = process.env.CHROME_BIN || '/repl/tools/bin/chromium';
const testUrl = 'http://localhost:80/cutline-website/';

function waitForDevTools(child) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error('Chromium did not open its DevTools connection.')), 15_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chromium exited before opening DevTools (code ${code ?? 'unknown'}). ${stderr}`));
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const endpoint = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/)?.[1];
      if (!endpoint) return;
      clearTimeout(timeout);
      resolve(endpoint);
    });
  });
}

async function getPageTarget(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch {
      // Chromium can print its WebSocket address before the discovery endpoint is ready.
    }
    await delay(100);
  }
  throw new Error('Chromium did not expose a page target.');
}

function connectDevTools(endpoint) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    const pending = new Map();
    let sequence = 0;
    socket.addEventListener('open', () => resolve({
      socket,
      send(method, params = {}) {
        return new Promise((sendResolve, sendReject) => {
          const id = ++sequence;
          pending.set(id, { resolve: sendResolve, reject: sendReject });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
    }), { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium DevTools.')), { once: true });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message);
    });
    socket.addEventListener('close', () => {
      for (const request of pending.values()) request.reject(new Error('Chromium DevTools disconnected.'));
      pending.clear();
    });
  });
}

async function run() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutline-team-marquee-'));
  const child = spawn(chromium, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-extensions',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let devtools;

  try {
    const endpoint = await waitForDevTools(child);
    const page = await getPageTarget(new URL(endpoint).port);
    devtools = await connectDevTools(page.webSocketDebuggerUrl);
    await devtools.send('Runtime.enable');
    await devtools.send('Page.enable');

    const evaluate = async (expression) => {
      const response = await devtools.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (response.result?.exceptionDetails) {
        throw new Error(response.result.exceptionDetails.text || 'Browser evaluation failed.');
      }
      return response.result?.result?.value;
    };
    const scrollTeamIntoView = async () => evaluate(`(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      const section = document.querySelector('#team');
      window.scrollTo(0, window.scrollY + section.getBoundingClientRect().top - 120);
    })()`);

    await devtools.send('Page.navigate', { url: testUrl });
    const pageReady = Date.now() + 20_000;
    let pageData;
    while (Date.now() < pageReady) {
      pageData = await evaluate(`(() => {
        const section = document.querySelector('#team');
        const originals = document.querySelectorAll('.team-card-set:not(.team-card-set-copy) .team-card');
        const remoteUsernames = [...originals].filter(card => card.querySelector('.team-username')?.textContent?.startsWith('@')).length;
        return document.readyState === 'complete' && section && originals.length === 7 && remoteUsernames >= 5
          ? { remoteUsernames, title: document.title }
          : null;
      })()`);
      if (pageData) break;
      await delay(250);
    }
    assert.ok(pageData, 'Expected seven team profiles, with Discord usernames rendered by the API.');

    await devtools.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await scrollTeamIntoView();
    await delay(350);

    const geometry = await evaluate(`(() => {
      const section = document.querySelector('#team');
      const region = section.querySelector('.team-marquee');
      const track = section.querySelector('.team-track');
      const sets = [...section.querySelectorAll('.team-card-set')];
      const originals = [...section.querySelectorAll('.team-card-set:not(.team-card-set-copy) .team-card')];
      const copies = [...section.querySelectorAll('.team-card-set-copy .team-card')];
      const animation = track.getAnimations()[0];
      const names = set => set.map(card => card.querySelector('h3')?.textContent?.trim());
      return {
        animationName: getComputedStyle(track).animationName,
        animationDirection: getComputedStyle(track).animationDirection,
        animationState: animation?.playState,
        setWidths: sets.map(set => set.getBoundingClientRect().width),
        trackWidth: track.getBoundingClientRect().width,
        trackGap: parseFloat(getComputedStyle(track).columnGap) || 0,
        originalNames: names(originals),
        copyNames: names(copies),
        originalTabStops: originals.filter(card => card.tabIndex === 0).length,
        copyTabStops: copies.filter(card => card.tabIndex >= 0).length,
        copyHidden: section.querySelector('.team-card-set-copy')?.getAttribute('aria-hidden') === 'true',
        regionNamed: Boolean(region.getAttribute('aria-label')),
        sectionNamed: Boolean(section.getAttribute('aria-labelledby') && document.getElementById(section.getAttribute('aria-labelledby'))),
        imagesHaveAlt: [...section.querySelectorAll('.team-card-set:not(.team-card-set-copy) img')].every(image => Boolean(image.alt)),
        card: (() => {
          const rect = originals[0].getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        })(),
      };
    })()`);

    assert.equal(geometry.animationName, 'team-marquee-scroll', 'Expected the team marquee animation.');
    assert.equal(geometry.animationDirection, 'normal', 'Expected rightward time progression through a left-moving track.');
    assert.equal(geometry.animationState, 'running', 'Expected the marquee to run when idle.');
    assert.equal(geometry.setWidths.length, 2, 'Expected one visible group and one seamless copy.');
    assert.ok(Math.abs(geometry.setWidths[0] - geometry.setWidths[1]) < 1, 'The copied set must have the same width as the original.');
    assert.ok(Math.abs(geometry.trackWidth - geometry.setWidths[0] * 2) < 1, 'The two equal sets must meet with no inter-set gap.');
    assert.equal(geometry.trackGap, 0, 'The repeated groups must have no additional gap at the loop seam.');
    assert.deepEqual(geometry.copyNames, geometry.originalNames, 'The repeated set must contain the same seven cards in the same order.');
    assert.equal(geometry.originalTabStops, 7, 'All original member cards must be keyboard-focusable.');
    assert.equal(geometry.copyTabStops, 0, 'Copied cards must not add keyboard stops.');
    assert.equal(geometry.copyHidden, true, 'Copied cards must be hidden from assistive technology.');
    assert.equal(geometry.regionNamed, true, 'The marquee region needs an accessible name.');
    assert.equal(geometry.sectionNamed, true, 'The team section needs a programmatic heading label.');
    assert.equal(geometry.imagesHaveAlt, true, 'Discord avatars need descriptive alternative text.');

    const loopBoundary = await evaluate(`(async () => {
      const track = document.querySelector('.team-track');
      const animation = track.getAnimations().find(item => item.animationName === 'team-marquee-scroll');
      const original = document.querySelector('.team-card-set:not(.team-card-set-copy) .team-card');
      const copy = document.querySelector('.team-card-set-copy .team-card');
      if (!animation) throw new Error('The CSS marquee animation was not found.');
      animation.pause();
      animation.effect.updateTiming({ duration: 60000 });
      animation.currentTime = 59990;
      const x = element => element.getBoundingClientRect().x;
      const before = { time: animation.currentTime, originalX: x(original), copyX: x(copy) };
      const boundary = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('The marquee did not emit an iteration boundary.')), 1500);
        track.addEventListener('animationiteration', event => {
          clearTimeout(timeout);
          resolve({
            elapsedTime: event.elapsedTime,
            time: animation.currentTime,
            originalX: x(original),
            copyX: x(copy),
          });
        }, { once: true });
      });
      animation.play();
      const after = await boundary;
      animation.pause();
      animation.effect.updateTiming({ duration: 54000 });
      animation.currentTime = 0;
      animation.play();
      return { before, after };
    })()`);
    assert.ok(loopBoundary.after.time >= 60000, 'The loop test must cross one full CSS animation iteration.');
    assert.ok(
      Math.abs(loopBoundary.before.copyX - loopBoundary.after.originalX) < 3,
      `The repeated first member must occupy the same position across the loop boundary: ${JSON.stringify(loopBoundary)}`,
    );

    await devtools.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: geometry.card.x,
      y: geometry.card.y,
    });
    await delay(120);
    const hoverPausedAt = await evaluate(`(() => {
      const track = document.querySelector('.team-track');
      const region = document.querySelector('.team-marquee');
      const card = document.querySelector('.team-card-set:not(.team-card-set-copy) .team-card');
      return {
        state: track.getAnimations()[0]?.playState,
        cssState: getComputedStyle(track).animationPlayState,
        time: track.getAnimations()[0]?.currentTime,
        transform: getComputedStyle(track).transform,
        regionHovered: region.matches(':hover'),
        cardHovered: card.matches(':hover'),
      };
    })()`);
    assert.equal(hoverPausedAt.state, 'paused', `Hovering a team card must pause the entire track: ${JSON.stringify({ hoverPausedAt, card: geometry.card })}`);
    await delay(220);
    const hoverStillPaused = await evaluate(`(() => {
      const track = document.querySelector('.team-track');
      return { time: track.getAnimations()[0]?.currentTime, transform: getComputedStyle(track).transform };
    })()`);
    assert.ok(Math.abs(hoverStillPaused.time - hoverPausedAt.time) < 1, 'The animation clock must remain fixed while hovering.');
    assert.equal(hoverStillPaused.transform, hoverPausedAt.transform, 'The visible marquee position must remain fixed while hovering.');

    await devtools.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    const pointerLeaveProcessedAt = Date.now();
    await delay(60);
    const hoverResumedAt = await evaluate(`(() => {
      const track = document.querySelector('.team-track');
      const region = document.querySelector('.team-marquee');
      const animations = track.getAnimations();
      return {
        state: animations[0]?.playState,
        cssState: getComputedStyle(track).animationPlayState,
        animationName: getComputedStyle(track).animationName,
        time: animations[0]?.currentTime,
        transform: getComputedStyle(track).transform,
        regionHovered: region.matches(':hover'),
      };
    })()`);
    const pointerLeaveObservedAt = Date.now();
    assert.equal(hoverResumedAt.state, 'running', 'The marquee must resume when the pointer leaves the cards.');
    const expectedResumeAdvance = pointerLeaveObservedAt - pointerLeaveProcessedAt;
    const actualResumeAdvance = hoverResumedAt.time - hoverStillPaused.time;
    assert.ok(
      Math.abs(actualResumeAdvance - expectedResumeAdvance) < 80,
      `Hover resume must continue from the paused animation time without a jump: ${JSON.stringify({ expectedResumeAdvance, actualResumeAdvance, hoverStillPaused, hoverResumedAt })}`,
    );
    await delay(200);
    const hoverAdvanced = await evaluate(`document.querySelector('.team-track').getAnimations()[0]?.currentTime`);
    assert.ok(hoverAdvanced > hoverResumedAt.time + 100, 'The marquee must continue moving after hover ends.');

    await evaluate(`document.querySelector('.team-card-set:not(.team-card-set-copy) .team-card').focus({preventScroll:true})`);
    const focusPausedAt = await evaluate(`(() => {
      const track = document.querySelector('.team-track');
      const region = document.querySelector('.team-marquee');
      return {
        state: track.getAnimations()[0]?.playState,
        cssState: getComputedStyle(track).animationPlayState,
        time: track.getAnimations()[0]?.currentTime,
        focusWithin: region.matches(':focus-within'),
        focusedCard: document.activeElement?.classList.contains('team-card'),
      };
    })()`);
    assert.equal(focusPausedAt.state, 'paused', `Keyboard focus on a member card must pause the entire marquee: ${JSON.stringify(focusPausedAt)}`);
    await delay(180);
    const focusStillPaused = await evaluate(`(() => {
      const track = document.querySelector('.team-track');
      const region = document.querySelector('.team-marquee');
      return {
        state: track.getAnimations()[0]?.playState,
        cssState: getComputedStyle(track).animationPlayState,
        time: track.getAnimations()[0]?.currentTime,
        focusWithin: region.matches(':focus-within'),
        focusedCard: document.activeElement?.classList.contains('team-card'),
      };
    })()`);
    assert.ok(
      Math.abs(focusStillPaused.time - focusPausedAt.time) < 1,
      `Keyboard focus must keep the animation at the same position: ${JSON.stringify({ focusPausedAt, focusStillPaused })}`,
    );
    const focusResume = await evaluate(`(() => {
      const track = document.querySelector('.team-track');
      const animation = track.getAnimations()[0];
      const paused = { state: animation?.playState, time: animation?.currentTime, transform: getComputedStyle(track).transform };
      document.activeElement.blur();
      const resumed = { state: animation?.playState, time: animation?.currentTime, transform: getComputedStyle(track).transform };
      return { paused, resumed };
    })()`);
    assert.equal(focusResume.paused.state, 'paused', 'The focused member must be paused immediately before blur.');
    assert.equal(focusResume.resumed.state, 'running', 'Leaving the focused member must resume the marquee.');
    assert.ok(Math.abs(focusResume.resumed.time - focusResume.paused.time) < 1, 'Keyboard resume must continue from the exact paused animation time.');
    assert.equal(focusResume.resumed.transform, focusResume.paused.transform, 'Keyboard resume must not jump to a different visual position.');

    await devtools.send('Emulation.setDeviceMetricsOverride', {
      width: 402,
      height: 874,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await devtools.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await scrollTeamIntoView();
    const mobile = await evaluate(`(() => {
      const viewport = document.querySelector('.team-viewport');
      const section = document.querySelector('#team');
      return {
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: viewport.getBoundingClientRect().width,
        cardWidth: section.querySelector('.team-card').getBoundingClientRect().width,
        toggleVisible: getComputedStyle(section.querySelector('.team-motion-toggle')).display !== 'none',
      };
    })()`);
    assert.ok(mobile.documentWidth <= mobile.width + 1, `Mobile page has horizontal overflow: ${mobile.documentWidth}px for ${mobile.width}px viewport.`);
    assert.ok(mobile.cardWidth <= mobile.width, 'Member cards must fit within a mobile viewport.');
    assert.equal(mobile.toggleVisible, true, 'Touch users must have an explicit way to pause/resume the marquee.');
    await evaluate(`document.querySelector('.team-motion-toggle').click()`);
    const touchPaused = await evaluate(`({
      pressed: document.querySelector('.team-motion-toggle').getAttribute('aria-pressed'),
      state: document.querySelector('.team-track').getAnimations()[0]?.playState,
    })`);
    assert.equal(touchPaused.pressed, 'true', 'The touch-friendly pause control must expose its pressed state.');
    assert.equal(touchPaused.state, 'paused', 'The touch-friendly pause control must pause the track.');
    await evaluate(`document.querySelector('.team-motion-toggle').click()`);

    await devtools.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await delay(300);
    const reduced = await evaluate(`(() => {
      const track = document.querySelector('.team-track');
      const viewport = document.querySelector('.team-viewport');
      const section = document.querySelector('#team');
      const toggle = section.querySelector('.team-motion-toggle');
      return {
        animationName: getComputedStyle(track).animationName,
        overflowX: getComputedStyle(viewport).overflowX,
        copyDisplay: getComputedStyle(section.querySelector('.team-card-set-copy')).display,
        originalCount: section.querySelectorAll('.team-card-set:not(.team-card-set-copy) .team-card').length,
        mediaMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
        toggleDisabled: toggle.disabled,
        toggleLabel: toggle.getAttribute('aria-label'),
      };
    })()`);
    assert.equal(reduced.animationName, 'none', 'Reduced-motion users must not receive an animated marquee.');
    assert.equal(reduced.overflowX, 'auto', 'The static reduced-motion roster must remain touch-scrollable.');
    assert.equal(reduced.copyDisplay, 'none', 'Reduced-motion mode must not show the duplicate set.');
    assert.equal(reduced.originalCount, 7, 'Reduced-motion mode must still show all seven members.');
    assert.equal(reduced.toggleDisabled, true, `The pause control must not offer a no-op when motion is already reduced: ${JSON.stringify(reduced)}`);

    const loadedAvatars = await evaluate(`(() => {
      const images = [...document.querySelectorAll('.team-card-set:not(.team-card-set-copy) img')];
      return {
        total: images.length,
        loaded: images.filter(image => image.complete && image.naturalWidth > 0).length,
        fallbacks: document.querySelectorAll('.team-card-set:not(.team-card-set-copy) .team-avatar-fallback').length,
      };
    })()`);
    process.stdout.write(`${JSON.stringify({
      result: 'pass',
      checks: {
        pageData: pageData.remoteUsernames,
        cards: geometry.originalNames.length,
        seamlessLoopGeometry: true,
        seamlessLoopBoundary: true,
        hoverPauseAndPositionPreserved: true,
        keyboardPauseAndPositionPreserved: true,
        mobileNoOverflow: true,
        touchPauseResume: true,
        reducedMotionStaticAndScrollable: true,
        accessibilityLabelsAndDuplicateSuppression: true,
      },
      discordImages: loadedAvatars,
    }, null, 2)}\n`);
  } finally {
    devtools?.socket.close();
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('close', resolve)),
      delay(3_000).then(() => child.kill('SIGKILL')),
    ]);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
