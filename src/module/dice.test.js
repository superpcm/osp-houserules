import { beforeEach, expect, it, vi } from 'vitest';

let evaluate;
beforeEach(() => {
  evaluate = vi.fn(async () => ({ total: 4, dice: [{ faces: 8, total: 4, results: [{ result: 4 }] }] }));
  vi.stubGlobal('Roll', class { constructor() { this.dice = []; } evaluate = evaluate; });
  vi.stubGlobal('game', { user: { isGM: true }, settings: { get: () => false } });
});

it('forces Foundry virtual rolls to be noninteractive', async () => {
  const { ospRoll } = await import('./dice.js');
  const result = await ospRoll('1d8');
  expect(evaluate).toHaveBeenCalledWith({ allowInteractive: false });
  expect(result.total).toBe(4);
});
