/** Presentation only: the existing race/class rules still choose the skills. */
export const JOURNAL_SKILL_LABELS = Object.freeze({
  listening: 'Listen at Doors',
  'find-secret-door': 'Find Secret Doors',
  'open-stuck-doors': 'Open Stuck Doors',
  'detect-construction': 'Detect Construction Tricks',
  'detect-room-traps': 'Detect Room Traps',
  assassination: 'Assassination',
  'climb-sheer': 'Climb Sheer Surfaces',
  'hide-shadows': 'Hide in Shadows',
  'move-silently': 'Move Silently',
  'find-traps': 'Find Traps',
  'open-locks': 'Open Locks',
  'pick-pockets': 'Pick Pockets',
  'hide-undergrowth': 'Hide in Undergrowth',
  'hide-dungeons': 'Hide in Dungeons',
  'foraging-hunting': 'Forage & Hunt',
  stealth: 'Stealth',
  'wilderness-surprise-attack': 'Surprise Attack',
  hiding: 'Hiding'
});

// Keep the original Bio frame, inset parchment, and north point. Skills deliberately
// omits Bio's unrelated illustration; a small sample of the same blank parchment
// covers it in the SVG without editing Bio's shared bitmap or redrawing its rim.
export const JOURNAL_BIO_MEDALLION_ART = '/systems/osp-houserules/assets/character-sheet/explorers-journal/bio-without-portrait-frame.png';

export function journalSkillLayout(requiredSkills) {
  const skills = [...new Set(requiredSkills)].filter(skill => Object.hasOwn(JOURNAL_SKILL_LABELS, skill));
  const columns = Math.min(6, Math.max(1, skills.length));
  const cellWidth = 800 / columns;
  const originalRadius = Math.min(78, (cellWidth - 34) / 2);
  const radius = originalRadius * 0.9;
  const spacing = cellWidth * 0.9;
  // Preserve diagram size and target centers so SVG fitting cannot undo the reduction.
  const rowHeight = originalRadius * 2 + 47;
  return {
    skills,
    width: 800,
    height: Math.max(1, Math.ceil(skills.length / columns)) * rowHeight,
    cells: skills.map((skill, index) => {
      const row = Math.floor(index / columns);
      const itemsInRow = Math.min(columns, skills.length - row * columns);
      return {
        skill, label: JOURNAL_SKILL_LABELS[skill], radius,
        cx: (800 - itemsInRow * spacing) / 2 + (index % columns + .5) * spacing,
        cy: row * rowHeight + originalRadius + 25
      };
    })
  };
}

export function journalSkillSvg(requiredSkills, instanceId) {
  const layout = journalSkillLayout(requiredSkills);
  const prefix = String(instanceId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const groups = layout.cells.map(({skill, label, radius, cx, cy}) => {
    const pathId = `ej-${prefix}-${skill}-arc`;
    const arc = radius + 8;
    const frameId = `ej-${prefix}-${skill}-frame`;
    const paperId = `ej-${prefix}-${skill}-blank-paper`;
    const featherId = `ej-${prefix}-${skill}-paper-edge`;
    const shadeId = `ej-${prefix}-${skill}-paper-shade`;
    return `<g class="cs-generated-skill" data-skill="${skill}">
      <path id="${pathId}" d="M ${cx - arc} ${cy} A ${arc} ${arc} 0 0 1 ${cx + arc} ${cy}" fill="none"/>
      <svg class="cs-skill-bio-medallion" data-decoration="none" x="${cx - radius}" y="${cy - radius}" width="${2 * radius}" height="${2 * radius}" viewBox="0 0 160 160" overflow="hidden">
        <defs>
          <clipPath id="${frameId}" clipPathUnits="userSpaceOnUse"><ellipse cx="80" cy="80" rx="79" ry="75"/></clipPath>
          <filter id="${featherId}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2"/></filter>
          <mask id="${paperId}" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="160"><rect x="60" y="109" width="40" height="30" rx="5" fill="white" filter="url(#${featherId})"/></mask>
          <linearGradient id="${shadeId}" gradientUnits="userSpaceOnUse" x1="0" y1="109" x2="0" y2="139"><stop stop-color="#744614" stop-opacity=".01"/><stop offset="47%" stop-color="#744614" stop-opacity=".075"/><stop offset="77%" stop-color="#744614" stop-opacity=".12"/><stop offset="100%" stop-color="#744614" stop-opacity=".24"/></linearGradient>
        </defs>
        <image href="${JOURNAL_BIO_MEDALLION_ART}" x="-270" y="-596" width="1185" height="1327" clip-path="url(#${frameId})"/>
        <g mask="url(#${paperId})" clip-path="url(#${frameId})">
          <image class="cs-skill-blank-paper" href="${JOURNAL_BIO_MEDALLION_ART}" x="-270" y="-556" width="1185" height="1327"/>
          <rect x="55" y="104" width="50" height="40" fill="url(#${shadeId})"/>
        </g>
      </svg>
      <circle id="${skill}" cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="none"/>
      <text class="cs-generated-skill-label"><textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escape(label)}</textPath></text>
    </g>`;
  }).join('');
  return { skills: layout.skills, markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" data-skill-svg="true" aria-hidden="true">${groups}</svg>` };
}
