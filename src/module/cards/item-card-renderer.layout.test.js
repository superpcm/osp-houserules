import { expect, it } from 'vitest';
import { ItemCardRenderer } from './item-card-renderer.js';

const renderer = Object.create(ItemCardRenderer.prototype);
renderer.CARD_WIDTH = 600;
renderer.CARD_HEIGHT = 900;
renderer.BODY_TOP = 165;
renderer.BASE_BODY_BOTTOM = 775;
renderer.LINE_HEIGHT = 40;

const context = {
  measureText: (value) => ({ width: String(value).length * 12 })
};

it('wraps the complete description without an ellipsis', () => {
  const description = 'Ring mail consists of a leather or cloth garment reinforced with metal rings sewn directly onto its surface, providing basic protection without the full weight of true chain mail. It is typically worn by low-status soldiers or adventurers needing inexpensive armor that offers better defense than padded or leather options, though it remains less effective than more advanced mail types.';
  const layout = renderer._calculateDescriptionLayout(context, description);

  expect(layout.lines.join(' ')).toBe(description);
  expect(layout.lines.join(' ')).not.toContain('…');
  expect(layout.descriptionTop + layout.descriptionHeight).toBe(layout.bodyBottom);
});

it('expands the card when description needs more room than the image minimum', () => {
  const description = Array.from({ length: 180 }, (_, index) => `word${index}`).join(' ');
  const layout = renderer._calculateDescriptionLayout(context, description);

  expect(layout.cardHeight).toBeGreaterThan(900);
  expect(layout.descriptionTop).toBeGreaterThanOrEqual(345);
  expect(layout.descriptionTop + layout.descriptionHeight).toBe(layout.bodyBottom);
});
