/*
 * Execute in the approved CUA runtime after GM/player login and fixture preparation.
 * This file intentionally is NOT a Playwright/CDP connection or a Node browser driver.
 * Both arguments are existing CUA Tab handles on the disposable local world.
 */
export async function runBrowserCombatChecks(gm, player) {
  const read = async tab => JSON.parse(await tab.playwright.getByTestId('browser-test-state').textContent());
  const assert = (condition, message) => { if (!condition) throw new Error(`BROWSER COMBAT FAILED: ${message}`); };
  const identity = async (tab, expectedGM) => {
    const state = await read(tab);
    assert(state.worldId === 'osp-browser-combat', 'wrong world');
    assert(/^\/private\/tmp\/osp-browser-combat-[A-Za-z0-9-]+$/.test(state.dataRoot), 'non-disposable data root');
    assert(['http://127.0.0.1:31051', 'http://localhost:31051'].includes(state.origin), 'wrong browser origin');
    assert(state.user.isGM === expectedGM, 'incorrect session role');
    assert(!state.paused, 'test world is paused');
    return state;
  };
  const gmState = await identity(gm, true), playerState = await identity(player, false);
  assert(gmState.nonce === playerState.nonce && gmState.sceneId === playerState.sceneId, 'sessions do not share the test fixture');
  assert(playerState.user.id === gmState.fixture.playerId && playerState.hero.owner, 'player does not own the test token');
  assert(playerState.hero.x === 100 && playerState.hero.y === 300, 'fixture must be freshly reset');
  const positions = [];
  const press = async (key, x, y) => {
    await player.pressKey(null, key, {durationMs:180});
    await player.getAXState();
    await player.playwright.locator(`[data-testid="hero-position"][data-x="${x}"][data-y="${y}"]`).waitFor({ state: 'visible', timeoutMs: 5000 });
    const state = await read(player);
    assert(state.hero.x === x && state.hero.y === y, `${key} did not yield ${x},${y}`);
    positions.push({ key, x: state.hero.x, y: state.hero.y });
  };
  const checkpoint = async name => {
    await gm.playwright.getByRole('button', { name: `Check ${name}`, exact: true }).click();
    await gm.getAXState();
    const check = (await read(gm)).checks.find(check => check.name === name);
    assert(check?.passed, `${name}: ${JSON.stringify(check)}`);
  };
  assert(playerState.hero.screen, 'hero is not drawn on the player canvas');
  await player.click([playerState.hero.screen.x, playerState.hero.screen.y]);
  await player.getAXState(); assert((await read(player)).hero.controlled, 'hero not selected by the player');
  await press('d', 200, 300); await checkpoint('open-move');
  await press('d', 300, 300); await press('d', 400, 300);
  // Attempt an actual prohibited move. The GM checkpoint checks the persisted
  // position, real wall backend, and the player's captured controlled key input.
  await player.pressKey(null, 'd', {durationMs:180}); await player.getAXState(); await checkpoint('wall-collision');
  await press('s', 400, 400); await press('s', 400, 500);
  await press('s', 400, 600); await press('s', 400, 700);
  await press('d', 500, 700); await checkpoint('route-around-wall');

  await gm.playwright.getByRole('tab', {name:'Combat Encounters', exact:true}).click();
  await gm.getAXState();
  // Enter Combat creates the encounter through the real token HUD.
  for (const tokenName of ['hero', 'enemy']) {
    const token = (await read(gm))[tokenName];
    await gm.click([token.screen.x, token.screen.y], {mouseButton:'right'});
    await gm.getAXState();
    await gm.playwright.getByRole('button', {name:'Enter Combat', exact:true}).click();
    await gm.getAXState();
  }
  await checkpoint('combat-created');
  const layout = await gm.playwright.locator('#combat').evaluate(el => {
    const sidebar = el.parentElement.getBoundingClientRect(), rect = el.getBoundingClientRect();
    const controls = [...el.querySelectorAll('button')].filter(button => button.getBoundingClientRect().width > 0).map(button => {
      const r = button.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {name:button.getAttribute('aria-label') || button.textContent.trim(), inside:r.left >= sidebar.left - 1 && r.right <= sidebar.right + 1, reachable:hit === button || button.contains(hit)};
    });
    return {width:rect.width, sidebarWidth:sidebar.width, inside:rect.left >= sidebar.left - 1 && rect.right <= sidebar.right + 1, controls};
  });
  assert(layout.inside && layout.controls.every(control => control.inside && control.reachable), `sidebar overflow or obscured controls: ${JSON.stringify(layout)}`);
  await gm.playwright.getByRole('button', {name:'Start Combat', exact:true}).click();
  await gm.getAXState(); await checkpoint('combat-started');
  await gm.playwright.getByRole('button', {name:'Next Turn', exact:true}).click();
  await gm.getAXState(); await checkpoint('next-turn');
  await gm.playwright.getByRole('button', {name:'Next Turn', exact:true}).click();
  await gm.getAXState(); await checkpoint('next-round');
  await gm.playwright.getByRole('button', {name:'End Combat', exact:true}).click();
  await gm.getAXState();
  await gm.playwright.getByRole('button', {name:'Yes', exact:true}).click();
  await gm.getAXState(); await checkpoint('combat-ended');
  const evidence = await read(gm);
  assert(evidence.checks.length === 8 && evidence.checks.every(check => check.passed), 'not all eight checks passed');
  assert(!evidence.errors.some(error => error.includes('marker-sheet.html')), 'marker template failed to preload');
  return {positions, layout, evidence, passed:true};
}
