#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const Handlebars = (await import(process.env.OSP_HANDLEBARS ?? '/Users/paul/Applications/FoundryVTT-Node-14.367/node_modules/handlebars/lib/index.js')).default;

const ROOT = process.cwd();
const PORT = 32105;
const SCOPE = 'osp-houserules';
const clone = value => structuredClone(value);
const items = data => ({ contents: data, filter: fn => data.filter(fn), values: () => data.values(), get: id => data.find(item => item.id === id) });

globalThis.foundry = { applications: { sheets: { ActorSheetV2: class {} }, api: {
  ApplicationV2: class { constructor(options = {}) { this.options = options; } async _prepareContext() { return {}; } },
  HandlebarsApplicationMixin: Base => class extends Base { },
} }, utils: { duplicate: clone, randomID: () => 'preview-id' } };
globalThis.Application = class {};
globalThis.Dialog = class {};
globalThis.Hooks = { on: () => null, off: () => null };
globalThis.ui = { notifications: { error: () => {} } };
globalThis.TextEditor = { getDragEventData: () => ({}) };
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
Handlebars.registerHelper('checked', value => value ? 'checked' : '');

function actor() {
  const flags = { party: true };
  const data = [
    { id: 'purse', name: 'Coin Purse', type: 'container', system: { quantity: 1, containerId: null } },
    { id: 'gold', name: 'Gold Coins', type: 'coin', system: { quantity: 12, containerId: 'purse' } },
    { id: 'silver', name: 'Silver Coins', type: 'coin', system: { quantity: 8, containerId: 'purse' } },
    { id: 'copper', name: 'Copper Coins', type: 'coin', system: { quantity: 5, containerId: 'purse' } },
    { id: 'pack', name: 'Backpack', type: 'container', system: { quantity: 1, capacity: 20, containerId: null } },
  ].map(entry => ({ ...entry, uuid: `Actor.hero.Item.${entry.id}`, img: 'icons/svg/item-bag.svg', toObject: () => clone(entry) }));
  return { id: 'hero', uuid: 'Actor.hero', name: 'Aldric', type: 'character', isOwner: true, ownership: { preview: 3 }, items: items(data), getFlag: (_scope, key) => flags[key] ?? null, setFlag: async (_scope, key, value) => { flags[key] = clone(value); } };
}
const hero = actor();
const store = { version: 1, revision: 3, name: 'Westford Outfitters', description: 'Supplies for the road ahead.', img: '', accessible: true, adjustment: 0, entries: [
  ['backpack', 'Backpack', 'container', 10, 6, 'gear/backpack'], ['rope', 'Rope', 'item', 5, 12, 'gear/rope-hempen'], ['torch', 'Torch', 'item', 1, null, 'gear/torch'], ['dagger', 'Dagger', 'weapon', 8, 4, 'weapons/dagger'], ['leather', 'Leather Armor', 'armor', 35, 2, 'armor/leather'], ['arrows', 'Arrows', 'ammunition', .5, null, 'ammunition/arrow'],
].map(([id, name, type, cost, stock, image]) => ({ id, sourceUuid: `Item.${id}`, customPrice: null, stock, hidden: false, itemData: { name, type, img: `systems/osp-houserules/assets/images/${image}.webp`, system: { cost, quantity: 1, tags: [], storedSize: 1, containerId: null, equipped: false, lashed: false } } })), history: [] };
function journal(id, data) { const flags = { [SCOPE]: { store: clone(data) } }; return { id, uuid: `JournalEntry.${id}`, name: data.name, flags, ownership: { default: 2 }, getFlag: (_s, k) => flags[SCOPE][k], setFlag: async (_s, k, value) => { flags[SCOPE][k] = clone(value); } }; }
const storeDocument = journal('store-preview', store);
const previewUserFlags = { storeCarts: { 'Actor%2Ehero:store-preview': { lines: [{ entryId: 'backpack', name: 'Backpack', quantity: 1, destination: '' }, { entryId: 'rope', name: 'Rope', quantity: 1, destination: '' }, { entryId: 'torch', name: 'Torch', quantity: 3, destination: '' }], pending: null } } };
const previewUser = { id: 'preview', isGM: true, character: hero, getFlag: (_s, key) => previewUserFlags[key] ?? null, setFlag: async (_s, key, value) => { previewUserFlags[key] = clone(value); } };
globalThis.game = { system: { id: SCOPE }, world: { id: 'preview' }, user: previewUser, users: Object.assign(new Map([['preview', previewUser]]), { activeGM: previewUser }), actors: [hero], items: items(store.entries.map(entry => ({ id: entry.id, name: entry.itemData.name, type: entry.itemData.type, img: entry.itemData.img, system: entry.itemData.system }))), journal: Object.assign(new Map([[storeDocument.id, storeDocument]]), { contents: [storeDocument] }), settings: { get: () => undefined, set: async () => {} } };
globalThis.Item = { implementation: class { constructor(data) { Object.assign(this, data); } } };
globalThis.fromUuid = async uuid => uuid === hero.uuid ? hero : null;

const { StoreApp } = await import('../src/module/apps/store-app.js');
const template = Handlebars.compile(await fs.readFile(path.join(ROOT, 'templates/apps/store-app.html'), 'utf8'));
const css = await fs.readFile(path.join(ROOT, 'dist/ose.css'), 'utf8');
const FOUNDRY_PUBLIC = path.join(process.env.OSP_FOUNDRY_APP || '/Users/paul/Applications/FoundryVTT-Node-14.367', 'public');
const shell = body => `<!doctype html><html><head><meta charset="utf-8"><title>Store preview</title><link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css"><style>${css}\nhtml,body{margin:0;background:#201a18;color:#2b211d} .preview-label{position:fixed;left:12px;bottom:10px;color:#eadbc3;font:12px sans-serif;z-index:20}.application.osp.osp-store-app{width:min(1120px,calc(100vw - 24px));height:760px;margin:24px auto;overflow:hidden;position:relative}</style></head><body><div class="application osp osp-store-app">${body}</div><div class="preview-label">Development fixture — no campaign changes</div></body></html>`;
function contextFor(mode) { const app = new StoreApp({ mode, storeId: storeDocument.id, actor: hero, draft: mode === 'creator' ? clone(store) : null, preview: false }); return app._prepareContext({}); }
const modes = new Map([['/creator', 'creator'], ['/shop', 'shop'], ['/manager', 'manager']]);
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://127.0.0.1:${PORT}`).pathname;
  if (!modes.has(pathname)) {
    const routes = [ ['/systems/osp-houserules/assets/', path.join(ROOT, 'assets')], ['/vendor/fontawesome/', path.join(FOUNDRY_PUBLIC, 'fonts/fontawesome')], ['/icons/', path.join(FOUNDRY_PUBLIC, 'icons')] ];
    for (const [prefix, base] of routes) {
      if (!pathname.startsWith(prefix)) continue;
      const file = path.resolve(base, decodeURIComponent(pathname.slice(prefix.length)));
      if (!file.startsWith(base + path.sep)) break;
      try {
        const data = await fs.readFile(file);
        const mime = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
        response.writeHead(200, { 'content-type': mime }); response.end(data); return;
      } catch (_) { break; }
    }
    response.writeHead(404); response.end('Not found'); return;
  }
  try { const context = await contextFor(modes.get(pathname)); response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(shell(template(context))); }
  catch (error) { response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); response.end(error.stack); }
});
server.listen(PORT, '127.0.0.1', () => console.log(`Store previews: http://127.0.0.1:${PORT}/creator  /shop  /manager`));
