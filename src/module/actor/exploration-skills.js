/**
 * Calculate the exploration-skill values displayed on a character sheet.
 * Pure data in, pure data out: Foundry and the DOM are deliberately absent.
 * @param {{race?: unknown, class?: unknown, level?: unknown, listeningAtDoors?: unknown, findSecretDoor?: unknown}} system
 */
export function deriveExplorationSkills(system = {}) {
  const race = String(system.race || '').toLowerCase().trim();
  const characterClass = String(system.class || '').toLowerCase().trim();
  const level = Math.max(1, Number.parseInt(String(system.level ?? 1), 10) || 1);
  const racialListening = ['dwarf', 'elf', 'gnome', 'hobbit'].includes(race) ? '2' : '1';
  const racialSecretDoor = ['elf', 'half-elf'].includes(race) ? '2' : '1';

  const listeningAtDoors = ['thief', 'assassin'].includes(characterClass)
    ? String(system.listeningAtDoors || '1')
    : racialListening;
  const findSecretDoor = ['thief', 'assassin', 'barbarian'].includes(characterClass)
    ? String(system.findSecretDoor || racialSecretDoor)
    : racialSecretDoor;

  return {
    listeningAtDoors,
    findSecretDoor,
    detectConstruction: ['dwarf', 'gnome'].includes(race) ? '2' : '',
    detectRoomTraps: race === 'dwarf' ? '2' : '',
    barbarianClimb: characterClass === 'barbarian' ? '5' : '',
    barbarianHide: characterClass === 'barbarian'
      ? (level <= 5 ? '1' : level <= 10 ? '2' : level <= 13 ? '3' : '4')
      : '',
    barbarianMove: characterClass === 'barbarian'
      ? (level <= 3 ? '1' : level <= 10 ? '2' : '3')
      : '',
  };
}
