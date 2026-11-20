export function skillStripGeometry(skillCount) {
  const count = Math.max(1, Number(skillCount) || 1);
  // Four full-size bronze rings fit with room for their curved labels.
  const cellWidth = 800 / 4;
  return { cellWidth, width: Math.max(800, count * cellWidth), height: 142, ringRadius: 48 };
}
