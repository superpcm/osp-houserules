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

function measuredContext() {
  const drawn = [];
  const ctx = { font: '', textAlign: 'left', measureText(value) { const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 32); return { width: String(value).length * size * 0.55, actualBoundingBoxAscent: size * 0.75, actualBoundingBoxDescent: size * 0.2 }; },
    fillText(value, x, y) { const width = this.measureText(value).width; drawn.push({ value, left: this.textAlign === 'center' ? x - width / 2 : x, right: this.textAlign === 'center' ? x + width / 2 : x + width, y }); },
    drawImage(_image, x, _y, width) { drawn.push({ icon: true, left: x, right: x + width }); } };
  return { ctx, drawn };
}

it('fits long vehicle titles inside the decorative corners', () => {
  const card = Object.create(ItemCardRenderer.prototype); card.COORDS = { item_name: [300, 48] }; card.FONTS = { NAME_SIZE: 54 }; card.FONT_FAMILY = 'Georgia';
  const { ctx, drawn } = measuredContext(); card._drawItemName(ctx, 'Wagon, Heavy Freight');
  expect(drawn[0].value).toBe('Wagon, Heavy Freight'); expect(drawn[0].left).toBeGreaterThanOrEqual(140); expect(drawn[0].right).toBeLessThanOrEqual(460);
});

it('shows all four vehicle footer values without clipping them under the corners', async () => {
  const card = Object.create(ItemCardRenderer.prototype); card.COORDS = { equipment_metadata: [300, 835] }; card.FONTS = { METADATA_SIZE: 32 }; card.BODY_FONT_FAMILY = 'Georgia'; card._loadIcon = async () => ({});
  const { ctx, drawn } = measuredContext(); await card._drawEquipmentMetadata(ctx, { type: 'container', system: { cost: 350, unitWeight: 650, storedSize: 99, capacity: 300 } });
  expect(drawn.filter(entry => !entry.icon).map(entry => entry.value)).toEqual(['350sp', '650lbs', '99S', '300C']);
  expect(drawn.every(entry => entry.left >= 140 - 0.01 && entry.right <= 460 + 0.01)).toBe(true);
});
