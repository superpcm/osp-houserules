/* Test instrumentation only. Normal movement and combat controls remain Foundry's UI. */
const ID = 'osp-browser-combat-tests';
const WORLD = 'osp-browser-combat';
let environment, panel, run = { checks: [], inputs: [], errors: [] };
const errors = [];
window.addEventListener('error', event => { errors.push(String(event.message)); render(); });
window.addEventListener('unhandledrejection', event => { errors.push(String(event.reason?.message ?? event.reason)); render(); });
const fixture = () => game.settings.get(ID, 'fixture');
const owned = doc => doc?.getFlag(ID, 'nonce') === environment?.nonce;
function guard(gm = false) {
  if (!environment?.disposable || environment.format !== 'osp-browser-combat-environment-v1' ||
      !/^\/private\/tmp\/osp-browser-combat-[a-zA-Z0-9-]+$/.test(environment.root) ||
      game.world.id !== WORLD || environment.worldId !== WORLD || game.system.id !== 'osp-houserules' ||
      location.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(location.hostname) || location.port !== '31051') {
    throw new Error('REFUSED: browser tests require the disposable loopback world.');
  }
  if (gm && !game.user.isGM) throw new Error('Fixture mutation requires the isolated test GM.');
}
const flags = () => ({ [ID]: { nonce: environment.nonce } });
function view() {
  const f = fixture();
  const scene = game.scenes.get(f.sceneId), hero = scene?.tokens.get(f.heroTokenId), enemy = scene?.tokens.get(f.enemyTokenId);
  const combat = game.combats.find(c => c.scene?.id === scene?.id || c.combatants.some(member => member.tokenId === f.heroTokenId));
  const object = canvas.ready && canvas.scene?.id === scene?.id ? canvas.tokens.get(hero?.id) : null;
  const screenFor = token => {
    if (!canvas.ready || canvas.scene?.id !== scene?.id || !token) return undefined;
    const rendered = canvas.tokens.get(token.id), board = document.getElementById('board');
    if (!rendered || !board) return undefined;
    const point = canvas.stage.worldTransform.apply(rendered.center), rect = board.getBoundingClientRect();
    return { x: point.x + rect.x, y: point.y + rect.y };
  };
  return {
    worldId: game.world.id, dataRoot: environment?.root, nonce: environment?.nonce,
    origin: location.origin, user: { id: game.user.id, name: game.user.name, isGM: game.user.isGM },
    sceneId: scene?.id ?? null, activeSceneId: game.scenes.active?.id ?? null, canvasSceneId: canvas.scene?.id ?? null,
    paused: game.paused, fixture: f,
    hero: hero ? { id: hero.id, actorId: hero.actorId, x: hero.toObject().x, y: hero.toObject().y, owner: hero.isOwner, controlled: object?.controlled ?? false, screen: screenFor(hero) } : null,
    enemy: enemy ? { id: enemy.id, actorId: enemy.actorId, x: enemy.toObject().x, y: enemy.toObject().y, screen: screenFor(enemy) } : null,
    walls: scene ? scene.walls.map(w => ({ id: w.id, c: [...w.c], move: w.move })) : [],
    combat: combat ? { id: combat.id, round: combat.round, turn: combat.turn, started: combat.started, combatants: combat.combatants.size, order: combat.turns.map(c => ({ id: c.id, actorId: c.actorId, initiative: c.initiative })) } : null,
    checks: run.checks, inputs: run.inputs, errors: [...errors]
  };
}
function render() {
  if (!panel || !environment || !game.ready) return;
  try {
    const state = view();
    const position = panel.querySelector('[data-testid="hero-position"]');
    position.textContent = state.hero ? `Hero: x=${state.hero.x}, y=${state.hero.y}; ${state.hero.controlled ? 'SELECTED' : 'unselected'}` : 'Fixture not prepared';
    position.dataset.x = String(state.hero?.x ?? ''); position.dataset.y = String(state.hero?.y ?? '');
    panel.querySelector('[data-testid="browser-test-state"]').textContent = JSON.stringify(state, null, 2);
    panel.querySelector('[data-testid="test-status"]').textContent = run.checks.length ? `${run.checks.filter(c => c.passed).length}/${run.checks.length} checks passed` : 'No checks recorded';
    panel.querySelector('[data-testid="check-list"]').replaceChildren(...run.checks.map(check => {
      const div = document.createElement('div'); div.className = check.passed ? 'pass' : 'fail'; div.textContent = `${check.passed ? 'PASS' : 'FAIL'} ${check.name}`; return div;
    }));
  } catch (error) { panel.querySelector('[data-testid="test-status"]').textContent = error.message; }
}
async function prepare() {
  guard(true);
  let f = fixture(), scene = game.scenes.get(f.sceneId);
  if (scene && !owned(scene)) throw new Error('Refusing to reset a scene outside this test fixture.');
  let player = game.users.get(f.playerId);
  if (!player) player = await User.create({ name: 'Browser Test Player', role: CONST.USER_ROLES.PLAYER, flags: flags() });
  if (!owned(player)) throw new Error('Refusing to reuse an unrelated user.');
  if (!scene) {
    const actor = await Actor.create({ name: 'Browser Hero', type: 'character', img: 'icons/svg/mystery-man.svg', ownership: { default: 0, [player.id]: 3 }, flags: flags(), system: { class: 'Fighter', race: 'Human', xp: 0, level: 1, hitpoints: 10, maxhitpoints: 10, attributes: Object.fromEntries(['str','dex','con','int','wis','cha'].map(name => [name, { value: 10 }])) } });
    const foe = await Actor.create({ name: 'Browser Enemy', type: 'monster', img: 'icons/svg/skull.svg', flags: flags(), system: { hp: { value: 10, max: 10 }, ac: 10, attributes: { dex: { value: 10 } } } });
    scene = await Scene.create({ name: 'BROWSER TEST — movement and wall', width: 1000, height: 800, padding: 0, grid: { type: 1, size: 100, distance: 5, units: 'ft' }, tokenVision: false, backgroundColor: '#ddd4bd', initial: { x: 500, y: 400, scale: 0.8 }, flags: flags() });
    const tokens = await scene.createEmbeddedDocuments('Token', [
      { name: 'Browser Hero', actorId: actor.id, actorLink: true, x: 100, y: 300, width: 1, height: 1, texture: { src: 'icons/svg/mystery-man.svg' }, disposition: 1, displayName: 50, sight: { enabled: false }, flags: flags() },
      { name: 'Browser Enemy', actorId: foe.id, actorLink: true, x: 700, y: 300, width: 1, height: 1, texture: { src: 'icons/svg/skull.svg' }, disposition: -1, displayName: 50, sight: { enabled: false }, flags: flags() }
    ]);
    await scene.createEmbeddedDocuments('Wall', [{ c: [500, 0, 500, 600], move: CONST.WALL_MOVEMENT_TYPES.NORMAL, sight: 0, light: 0, sound: 0, door: 0, flags: flags() }]);
    await scene.createEmbeddedDocuments('Drawing', [{ x: 496, y: 0, shape: { type: 'r', width: 8, height: 600 }, fillType: 1, fillColor: '#b63e32', fillAlpha: 0.75, strokeColor: '#9c2a20', strokeWidth: 2, flags: flags() }]);
    f = { sceneId: scene.id, heroTokenId: tokens.find(token => token.actorId === actor.id).id, enemyTokenId: tokens.find(token => token.actorId === foe.id).id, heroActorId: actor.id, enemyActorId: foe.id, playerId: player.id };
    await game.settings.set(ID, 'fixture', f);
  }
  // Foundry does not guarantee embedded-document creation result order.
  f.heroTokenId = scene.tokens.find(token => token.actorId === f.heroActorId)?.id;
  f.enemyTokenId = scene.tokens.find(token => token.actorId === f.enemyActorId)?.id;
  await game.settings.set(ID, 'fixture', f);
  await player.update({ character: f.heroActorId });
  for (const combat of game.combats.filter(c => c.scene?.id === scene.id || c.combatants.some(member => member.tokenId === f.heroTokenId))) await combat.delete();
  await scene.updateEmbeddedDocuments('Token', [{ _id: f.heroTokenId, x: 100, y: 300 }, { _id: f.enemyTokenId, x: 700, y: 300 }], { animate: false });
  await game.settings.set(game.system.id, 'diceMode', 'virtual');
  await game.settings.set(game.system.id, 'initiative', 'individual');
  await game.settings.set(game.system.id, 'rerollInitiative', 'keep');
  game.togglePause(false, { broadcast: true });
  const drawn = canvas.ready && canvas.scene?.id === scene.id ? Promise.resolve() : new Promise((resolve, reject) => {
    const hook = Hooks.on('canvasReady', drawnCanvas => { if (drawnCanvas.scene?.id === scene.id) { clearTimeout(timer); Hooks.off('canvasReady', hook); resolve(); } });
    const timer = setTimeout(() => { Hooks.off('canvasReady', hook); reject(new Error('Test scene did not finish drawing')); }, 15000);
  });
  await scene.activate(); await drawn;
  await canvas.pan({ x: 500, y: 400, scale: 0.8 });
  run = { startedAt: new Date().toISOString(), checks: [], inputs: [], errors: [] };
  render();
}
function record(name) {
  guard(true);
  const state = view(), f = fixture(), previous = Object.fromEntries(run.checks.map(check => [check.name, check]));
  const { checks: _checks, inputs: _inputs, errors: _errors, ...snapshot } = state;
  let passed = false, expected, evidence = snapshot;
  if (name === 'open-move') { expected = { x: 200, y: 300 }; passed = state.hero?.x === 200 && state.hero?.y === 300; }
  if (name === 'wall-collision') {
    const object = canvas.tokens.get(f.heroTokenId);
    const collision = object.checkCollision({ x: 550, y: 350 }, { origin: { x: 450, y: 350 }, type: 'move', mode: 'any' });
    const attempted = run.inputs.some(input => input.code === 'KeyD' && input.x === 400 && input.y === 300 && input.userId === f.playerId && input.controlled && !input.paused);
    expected = { x: 400, y: 300, collision: true, playerAttempt: true };
    evidence = { position: state.hero, collision: Boolean(collision), attempted };
    passed = state.hero?.x === 400 && state.hero?.y === 300 && Boolean(collision) && attempted;
  }
  if (name === 'route-around-wall') { expected = { x: 500, y: 700 }; passed = state.hero?.x === 500 && state.hero?.y === 700; }
  if (name === 'combat-created') { expected = { round: 0, combatants: 2 }; passed = state.combat?.round === 0 && state.combat.combatants === 2; }
  if (name === 'combat-started') { expected = { round: 1, turn: 0, combatants: 2 }; passed = state.combat?.round === 1 && state.combat.turn === 0 && state.combat.combatants === 2 && state.combat.order.every(c => Number.isFinite(c.initiative)); }
  if (name === 'next-turn') { expected = { round: 1, turn: 1 }; passed = Boolean(previous['combat-started']?.passed) && state.combat?.round === 1 && state.combat.turn === 1; }
  if (name === 'next-round') { expected = { round: 2, turn: 0 }; passed = Boolean(previous['next-turn']?.passed) && state.combat?.round === 2 && state.combat.turn === 0; }
  if (name === 'combat-ended') { expected = { combatDeleted: true }; passed = Boolean(previous['next-round']?.passed) && !game.combats.has(previous['combat-started']?.evidence?.combat?.id); }
  run.checks = run.checks.filter(check => check.name !== name);
  run.checks.push({ name, passed, expected, evidence: JSON.parse(JSON.stringify(evidence)), at: new Date().toISOString() });
  render();
}
Hooks.once('init', () => game.settings.register(ID, 'fixture', { scope: 'world', config: false, type: Object, default: {} }));
Hooks.once('ready', async () => {
  try {
    const response = await fetch(`modules/${ID}/environment.json`); if (!response.ok) throw new Error('Missing disposable environment marker');
    environment = await response.json(); guard();
    panel = document.createElement('aside'); panel.id = 'osp-browser-tests';
    panel.innerHTML = '<h2>DISPOSABLE BROWSER COMBAT TEST</h2><output data-testid="test-status"></output><output data-testid="hero-position"></output><div class="actions"></div><div data-testid="check-list"></div><details><summary>State / JSON evidence</summary><pre data-testid="browser-test-state"></pre></details>';
    if (game.user.isGM) {
      const add = (label, fn) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', async () => { button.disabled = true; try { await fn(); } catch (error) { errors.push(error.message); ui.notifications.error(error.message); } finally { button.disabled = false; render(); } }); panel.querySelector('.actions').appendChild(button); };
      add('Prepare / reset fixture', prepare);
      add('Export browser evidence', () => { guard(true); foundry.utils.saveDataToFile(JSON.stringify(view(), null, 2), 'application/json', 'osp-browser-combat-evidence.json'); });
      for (const name of ['open-move','wall-collision','route-around-wall','combat-created','combat-started','next-turn','next-round','combat-ended']) add(`Check ${name}`, () => record(name));
    }
    document.body.appendChild(panel);
    for (const hook of ['updateToken','refreshToken','canvasPan','controlToken','createCombat','updateCombat','deleteCombat','canvasReady','updateSetting','pauseGame']) Hooks.on(hook, render);
    game.socket.on(`module.${ID}`, input => {
      if (!game.user.isGM || input?.nonce !== environment.nonce || input?.userId !== fixture().playerId || !['KeyW','KeyA','KeyS','KeyD'].includes(input.code)) return;
      run.inputs.push(input); render();
    });
    document.addEventListener('keydown', event => {
      if (game.user.id !== fixture().playerId || !['KeyW','KeyA','KeyS','KeyD'].includes(event.code)) return;
      const token = canvas.tokens.controlled.find(t => t.id === fixture().heroTokenId); if (!token) return;
      game.socket.emit(`module.${ID}`, { nonce: environment.nonce, userId: game.user.id, key: event.key, code: event.code, controlled: true, x: token.document.x, y: token.document.y, paused: game.paused });
    }, { capture: true });
    render();
  } catch (error) { console.error(`${ID}: ${error.message}`); ui.notifications.error(error.message); }
});
