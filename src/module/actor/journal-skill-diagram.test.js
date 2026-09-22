import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { JOURNAL_BIO_MEDALLION_ART, JOURNAL_SKILL_LABELS, journalSkillLayout, journalSkillSvg } from './journal-skill-diagram.js';

describe('Explorer’s Journal skill medallions', () => {
  const allSkills = Object.keys(JOURNAL_SKILL_LABELS);
  for (let count = 1; count <= allSkills.length; count++) {
    it(`keeps ${count} skill targets inside the diagram without collisions`, () => {
      const layout = journalSkillLayout(allSkills.slice(0, count));
      expect(layout.cells).toHaveLength(count);
      for (const cell of layout.cells) {
        expect(cell.cx - cell.radius - 8).toBeGreaterThanOrEqual(0);
        expect(cell.cx + cell.radius + 8).toBeLessThanOrEqual(layout.width);
        expect(cell.cy - cell.radius - 21).toBeGreaterThanOrEqual(0);
        expect(cell.cy + cell.radius).toBeLessThan(layout.height);
        for (const other of layout.cells.filter(other => other !== cell)) {
          expect(Math.hypot(cell.cx - other.cx, cell.cy - other.cy)).toBeGreaterThan(2 * cell.radius + 16);
        }
      }
    });
  }
  it('deduplicates shared class/race skills and ignores unknown keys', () => {
    expect(journalSkillLayout(['listening', 'listening', 'unknown']).skills).toEqual(['listening']);
  });
  it('produces finite geometry for empty character data', () => {
    const { markup } = journalSkillSvg([], 'empty');
    expect(markup).not.toMatch(/NaN|Infinity/);
  });
  it('uses the original Bio artwork at the registered medallion crop dimensions', () => {
    const artworkName = JOURNAL_BIO_MEDALLION_ART.split('/').at(-1);
    // The live Bio background can evolve independently of these fixed SVG crops.
    const artwork = readFileSync(new URL(`../../../assets/character-sheet/explorers-journal/${artworkName}`, import.meta.url));
    expect([...artwork.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(artwork.readUInt32BE(16)).toBe(1185);
    expect(artwork.readUInt32BE(20)).toBe(1327);
    const { markup } = journalSkillSvg(allSkills, 'matching-bio');
    expect(markup.match(/<image /g)).toHaveLength(allSkills.length * 2);
    expect(markup.match(new RegExp(artworkName.replaceAll('.', '\\.'), 'g'))).toHaveLength(allSkills.length * 2);
    expect(markup).not.toContain('skill-illustrations-');
    expect(markup).not.toContain('fill="black"');
  });
  it('omits unrelated Bio illustrations from every supported skill', () => {
    const { markup } = journalSkillSvg(allSkills, 'no-motifs');
    expect(markup).not.toContain('data-bio-motif');
    expect(markup.match(/data-decoration="none"/g)).toHaveLength(allSkills.length);
    expect(markup.match(/class="cs-skill-blank-paper"/g)).toHaveLength(allSkills.length);
    expect(markup).not.toMatch(/undefined|NaN/);
    expect(markup.match(/<circle id=/g)).toHaveLength(allSkills.length);
  });
  it('gives different actor sheets independent curved-label paths', () => {
    const a = journalSkillSvg(allSkills, 'actor-1').markup;
    const b = journalSkillSvg(allSkills, 'actor-2').markup;
    expect(a).toContain('ej-actor-1-listening-arc');
    expect(b).not.toContain('ej-actor-1-listening-arc');
    expect(a).toContain('Forage &amp; Hunt');
  });
  it('keeps saving-throw SVGs attached to their styled component and unique label paths', () => {
    const template = readFileSync(new URL('../../../templates/actors/character-sheet.html', import.meta.url), 'utf8');
    const arcs = template.match(/<svg class="combat-save-label-arc[^\"]*"[^>]*>.*?<\/svg>/g);
    expect(arcs).toHaveLength(5);
    for (const [index, slug] of ['death', 'wands', 'paralysis', 'breath', 'spells'].entries()) {
      expect(arcs[index]).toContain(`id="save-{{actor.id}}-label-${slug}"`);
      expect(arcs[index]).toContain(`href="#save-{{actor.id}}-label-${slug}"`);
      expect(arcs[index]).toContain('M 7 62 A 58 58 0 0 1 123 62');
    }
  });
});
