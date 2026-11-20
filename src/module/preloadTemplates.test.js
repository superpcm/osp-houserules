import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({ OSP: { systemPath: () => 'systems/test-osp' } }));
import { preloadHandlebarsTemplates } from './preloadTemplates.js';

afterEach(() => vi.unstubAllGlobals());

it('resolves every preloaded template inside the selected system, including markers', async () => {
  const loadTemplates = vi.fn().mockResolvedValue([]);
  vi.stubGlobal('foundry', { applications: { handlebars: { loadTemplates } } });
  await preloadHandlebarsTemplates();
  const [paths] = loadTemplates.mock.calls[0];
  expect(paths).toContain('systems/test-osp/templates/actors/marker-sheet.html');
  expect(paths.every(path => path.startsWith('systems/test-osp/templates/'))).toBe(true);
});
