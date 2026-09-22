import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import jquery from 'jquery';
import { XPProgressHandler } from './xp-progress-handler.js';

describe('XPProgressHandler formatting', () => {
  const handler = new XPProgressHandler(null, null, null);

  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [5240, '5,240'],
    ['1234567', '1,234,567'],
    ['9,876', '9,876'],
  ])('formats %s for display', (value, expected) => {
    expect(handler.formatXP(value)).toBe(expected);
  });

  it('formats the read-only display without adding XP to ordinary form submissions', () => {
    const dom = new JSDOM('<form><input class="xp-display" readonly></form>');
    const $ = jquery(dom.window);
    vi.stubGlobal('$', $);
    const form = $(dom.window.document.querySelector('form'));
    const instance = new XPProgressHandler(form, null, null);
    instance.xpDisplay = form.find('.xp-display');
    instance.updateXPFields(5240);
    expect(instance.xpDisplay.val()).toBe('5,240');
    expect(new dom.window.FormData(form[0]).has('system.xp')).toBe(false);
    dom.window.close();
  });
});

afterEach(() => vi.unstubAllGlobals());
