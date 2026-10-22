/**
 * Calculate the exploration-skill values displayed on a character sheet.
 * Pure data in, pure data out: Foundry and the DOM are deliberately absent.
 * @param {{race?: unknown, class?: unknown, level?: unknown, listeningAtDoors?: unknown, findSecretDoor?: unknown, climbSheer?: unknown, hideUndergrowth?: unknown, moveSilently?: unknown}} system
 */
export function deriveExplorationSkills(system = {}) {
  const race = String(system.race || '').toLowerCase().trim();
  const characterClass = String(system.class || '').toLowerCase().trim();
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
    effectiveListeningAtDoors: String(Math.max(Number(racialListening), Math.min(5, Number(listeningAtDoors) || 1))),
    findSecretDoor,
    effectiveFindSecretDoor: racialSecretDoor,
    detectConstruction: ['dwarf', 'gnome'].includes(race) ? '2' : '',
    detectRoomTraps: race === 'dwarf' ? '2' : '',
    barbarianClimb: characterClass === 'barbarian' ? String(system.climbSheer || '1') : '',
    barbarianHide: characterClass === 'barbarian' ? String(system.hideUndergrowth || '1') : '',
    barbarianMove: characterClass === 'barbarian' ? String(system.moveSilently || '1') : '',
  };
}
