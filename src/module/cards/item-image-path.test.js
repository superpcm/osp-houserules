import { describe, expect, it } from 'vitest';
import {
  resolveFullResolutionImagePath,
  resolveItemImagePath,
  withItemImageCacheBuster
} from './item-image-path.js';

describe('item image paths', () => {
  it('keeps user assets rooted in userdata and resolves their sibling full image', () => {
    const thumb = 'assets/osp-spell-focus/mage-staff_thumb.webp?cache=1#card';
    expect(resolveItemImagePath(thumb)).toBe(thumb);
    expect(resolveFullResolutionImagePath(thumb)).toBe('assets/osp-spell-focus/mage-staff.webp');
    expect(resolveFullResolutionImagePath('/assets/osp-spell-focus/mage-staff_thumb.webp')).toBe(
      '/assets/osp-spell-focus/mage-staff.webp'
    );
  });

  it('maps system thumbnails to their full-size system image', () => {
    expect(resolveFullResolutionImagePath(
      'systems/osp-houserules/assets/thumbs/images/gear/lute_thumb.webp?x=1'
    )).toBe('systems/osp-houserules/assets/images/gear/lute.webp');
  });

  it('preserves legacy system-relative assets, icons, magic thumbnails, and external URLs', () => {
    expect(resolveItemImagePath('assets/images/gear/lute_thumb.webp')).toBe(
      'systems/osp-houserules/assets/images/gear/lute_thumb.webp'
    );
    expect(resolveItemImagePath('icons/svg/book.svg')).toBe('icons/svg/book.svg');
    expect(resolveFullResolutionImagePath('magic-item-thumbs/item_thumb.webp')).toBe(
      'magic-item-thumbs/item.webp'
    );
    expect(resolveItemImagePath('https://example.test/item.webp?x=1')).toBe(
      'https://example.test/item.webp?x=1'
    );
    expect(resolveFullResolutionImagePath('https://example.test/item.webp?x=1')).toBe(
      'https://example.test/item.webp?x=1'
    );
    expect(resolveFullResolutionImagePath(
      'https://cdn.example.test/mage-staff_thumb.webp?token=signed#fragment'
    )).toBe('https://cdn.example.test/mage-staff_thumb.webp?token=signed#fragment');
    expect(withItemImageCacheBuster('assets/osp-spell-focus/mage-staff.webp?existing=1#fragment', 12, 0.5))
      .toBe('assets/osp-spell-focus/mage-staff.webp?existing=1&v=12&r=0.5#fragment');
    expect(withItemImageCacheBuster(
      'https://cdn.example.test/mage-staff_thumb.webp?token=signed#fragment', 12, 0.5
    )).toBe('https://cdn.example.test/mage-staff_thumb.webp?token=signed#fragment');
  });
});
