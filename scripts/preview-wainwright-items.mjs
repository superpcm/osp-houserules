#!/usr/bin/env node
// Local artifact renderer. Uses the production item-card renderer and never connects to Foundry.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'output/wainwright-batch-2026-10-27');
const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
const items = JSON.parse(await fs.readFile(path.join(output, 'items.json'), 'utf8'));
const byName = new Map(items.map(item => [item.name, item]));
const entries = manifest.items.map(entry => ({ slug: entry.slug, item: byName.get(entry.name) }));
const allowed = new Set(entries.map(entry => entry.slug));
const port = Number(process.env.OSP_WAINWRIGHT_PREVIEW_PORT || 32117);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Wainwright item cards</title><style>
body{margin:0;padding:24px;background:#302015;color:#fff0ce;font:16px Georgia,serif}h1{margin:0 0 8px}p{margin:0 0 24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}figure{margin:0}canvas{display:block;width:100%;height:auto;max-width:600px}figcaption{margin:10px 0;font-weight:bold}a{color:#fff0ce}#status{padding:10px 0}
</style></head><body><h1>Wainwright catalog batch</h1><p>Production item-card renderer · generated artwork · no campaign changes</p><div id="status">Rendering cards…</div><main></main><script type="module">
import {ItemCardRenderer} from '/systems/osp-houserules/src/module/cards/item-card-renderer.js';
window.game={system:{id:'osp-houserules'},user:{character:null}};
const entries=${JSON.stringify(entries).replace(/</g, '\\u003c')};
const renderer=new ItemCardRenderer();let count=0;
try{for(const entry of entries){const canvas=await renderer.renderCard(entry.item);const figure=document.createElement('figure');figure.dataset.slug=entry.slug;const caption=document.createElement('figcaption');caption.textContent=entry.item.name;figure.append(canvas,caption);document.querySelector('main').append(figure);const response=await fetch('/export-card',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug:entry.slug,png:canvas.toDataURL('image/png')})});if(!response.ok)throw new Error('Could not save '+entry.item.name);count++;document.querySelector('#status').textContent=count+' / '+entries.length+' cards exported';}document.body.dataset.complete='true';}catch(error){document.querySelector('#status').textContent=error.message;document.body.dataset.error='true';console.error(error);}
</script></body></html>`;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:' + port);
    if (request.method === 'POST' && url.pathname === '/export-card') {
      let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 12_000_000) { response.writeHead(413).end(); return; } }
      const payload = JSON.parse(body);
      if (!allowed.has(payload.slug) || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(payload.png)) { response.writeHead(400).end(); return; }
      await fs.mkdir(path.join(output, 'cards'), { recursive: true });
      await fs.writeFile(path.join(output, 'cards', payload.slug + '.png'), Buffer.from(payload.png.split(',')[1], 'base64'));
      response.writeHead(204).end(); return;
    }
    if (url.pathname === '/') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html); return; }
    const prefix = '/systems/osp-houserules/';
    if (!url.pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
    const relative = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!relative.startsWith('assets/') && !relative.startsWith('src/module/cards/')) { response.writeHead(404).end(); return; }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const bytes = await fs.readFile(file);
    const mime = { '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' }[path.extname(file)] || 'application/octet-stream';
    response.writeHead(200, { 'content-type': mime }).end(bytes);
  } catch (error) { response.writeHead(500, { 'content-type': 'text/plain' }).end(error.message); }
});
server.listen(port, '127.0.0.1', () => console.log('Wainwright item card preview: http://127.0.0.1:' + port));
