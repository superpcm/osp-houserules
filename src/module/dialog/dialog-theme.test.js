import { describe, expect, it } from 'vitest';
import { ospDialogOptions } from './dialog-theme.js';

describe('ospDialogOptions', () => {
  it('adds unique shared classes without mutating options', () => {
    const nested = { title: 'keep reference' };
    const options = { width: 420, classes: ['custom', 'osp'], nested };
    const result = ospDialogOptions(options);

    expect(result).toEqual({ width: 420, classes: ['osp', 'osp-dialog', 'custom'], nested });
    expect(result).not.toBe(options);
    expect(result.nested).toBe(nested);
    expect(options.classes).toEqual(['custom', 'osp']);
  });

  it('handles missing and string classes', () => {
    expect(ospDialogOptions()).toEqual({ classes: ['osp', 'osp-dialog'] });
    expect(ospDialogOptions({ classes: 'custom' }).classes).toEqual(['osp', 'osp-dialog', 'custom']);
  });
});
