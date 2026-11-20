const active = new Map();
let tickerCallback;
let tickerOwner;
let reducedMotionPreference;

const isMarker = token => token?.actor?.type === 'marker' || token?.document?.actor?.type === 'marker';
const reducedMotion = () => {
  if (reducedMotionPreference === undefined) reducedMotionPreference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  return reducedMotionPreference;
};

const fragment = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform highp vec4 inputSize;
uniform float strength;
uniform float time;
void main() {
  vec2 px = inputSize.zw;
  vec4 center = texture2D(uSampler, vTextureCoord);
  float halo = 0.0;
  for (int radius = 1; radius <= 3; radius++) {
    float r = float(radius) * 5.0;
    for (int i = 0; i < 16; i++) {
      float a = 6.2831853 * float(i) / 16.0;
      halo = max(halo, texture2D(uSampler, vTextureCoord + vec2(cos(a), sin(a)) * r * px).a * (1.0 - float(radius) / 4.0));
    }
  }
  float pulse = 0.65 + 0.35 * sin(time);
  float edge = halo * strength * pulse * (1.0 - center.a);
  vec3 gold = vec3(1.0, 0.78, 0.25);
  gl_FragColor = vec4(center.rgb + gold * edge, center.a + edge);
}`;

function ensureTicker() {
  if (tickerCallback || !globalThis.canvas?.app?.ticker) return;
  tickerCallback = () => {
    const now = performance.now() / 1000;
    for (const { filter } of active.values()) filter.uniforms.time = reducedMotion() ? 0 : now * 2.61799;
  };
  tickerOwner = canvas.app.ticker;
  tickerOwner.add(tickerCallback);
}

function stopTicker() {
  if (!tickerCallback || active.size || !tickerOwner) return;
  tickerOwner.remove(tickerCallback);
  tickerCallback = undefined;
  tickerOwner = undefined;
}

function clear(token) {
  const entry = active.get(token);
  if (!entry) return;
  if (Array.isArray(entry.mesh.filters)) entry.mesh.filters = entry.mesh.filters.filter(filter => filter !== entry.filter);
  entry.filter.destroy?.();
  active.delete(token);
  stopTicker();
}

function apply(token) {
  if (!isMarker(token) || !token.mesh || !globalThis.PIXI) { if (active.has(token)) clear(token); return; }
  const existing = active.get(token);
  if (existing?.mesh === token.mesh) {
    if (!Array.isArray(token.mesh.filters) || !token.mesh.filters.includes(existing.filter)) token.mesh.filters = [...(token.mesh.filters || []), existing.filter];
    ensureTicker();
    return;
  }
  if (existing) clear(token);
  const baseFilters = Array.isArray(token.mesh.filters) ? [...token.mesh.filters] : [];
  const filter = new PIXI.Filter(undefined, fragment, { strength: 1.0, time: reducedMotion() ? 0 : 0 });
  filter.padding = 16;
  token.mesh.filters = [...baseFilters, filter];
  active.set(token, { mesh: token.mesh, filter, baseFilters });
  ensureTicker();
}

export function registerMarkerGlow() {
  Hooks.on('drawToken', token => apply(token));
  Hooks.on('refreshToken', token => apply(token));
  Hooks.on('destroyToken', token => clear(token));
  Hooks.on('canvasTearDown', () => { for (const token of [...active.keys()]) clear(token); });
  Hooks.on('canvasReady', () => { for (const token of canvas.tokens?.placeables || []) apply(token); });
}

export const _markerGlowTest = { active, apply, clear, reducedMotion };
