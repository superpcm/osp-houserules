import { describe, expect, it } from 'vitest';
import { deriveExplorationSkills } from './exploration-skills.js';

describe('deriveExplorationSkills', () => {
  it('derives dwarf racial exploration abilities', () => {
    expect(deriveExplorationSkills({ race: 'Dwarf', class: 'Fighter' })).toMatchObject({
      listeningAtDoors: '2',
      findSecretDoor: '1',
      detectConstruction: '2',
      detectRoomTraps: '2',
    });
  });

  it('preserves editable thief values', () => {
    expect(deriveExplorationSkills({
      race: 'Human', class: 'Thief', listeningAtDoors: '4', findSecretDoor: '3',
    })).toMatchObject({ listeningAtDoors: '4', findSecretDoor: '3' });
  });

  it('derives barbarian d6 skills from their allocated values', () => {
    expect(deriveExplorationSkills({ race: 'Human', class: 'Barbarian', level: 11, climbSheer: '3', hideUndergrowth: '2', moveSilently: '4' })).toMatchObject({
      barbarianClimb: '3', barbarianHide: '2', barbarianMove: '4',
    });
  });
});


describe('BR-17 effective racial skills', () => {
  const races = { Human: 1, Dwarf: 2, Elf: 2, 'Half-Elf': 1, 'Half-Orc': 1, Gnome: 2, Hobbit: 2 };
  for (const [race, hearing] of Object.entries(races)) {
    it(`${race}: preserves training while deriving hearing across all skill classes`, () => {
      for (const characterClass of ['Fighter', 'Thief', 'Assassin', 'Barbarian', 'Mage', 'Ranger', 'Warden', 'Bard', 'Beast Master']) {
        for (const trained of [1, 2, 3, 4, 5]) {
          const input = { race, class: characterClass, listeningAtDoors: String(trained), findSecretDoor: '5' };
          const result = deriveExplorationSkills(input);
          const isTrained = ['Thief', 'Assassin'].includes(characterClass);
          expect(result.effectiveListeningAtDoors).toBe(String(isTrained ? Math.max(hearing, trained) : hearing));
          if (isTrained) expect(result.listeningAtDoors).toBe(String(trained));
          expect(result.effectiveFindSecretDoor).toBe(['Elf', 'Half-Elf'].includes(race) ? '2' : '1');
          expect(result.detectConstruction).toBe(['Dwarf', 'Gnome'].includes(race) ? '2' : '');
          expect(result.detectRoomTraps).toBe(race === 'Dwarf' ? '2' : '');
          expect(input.listeningAtDoors).toBe(String(trained));
        }
      }
    });
  }
});
