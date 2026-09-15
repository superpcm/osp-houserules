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

  it('derives barbarian level progression', () => {
    expect(deriveExplorationSkills({ race: 'Human', class: 'Barbarian', level: 11 })).toMatchObject({
      barbarianClimb: '5', barbarianHide: '3', barbarianMove: '3',
    });
  });
});
