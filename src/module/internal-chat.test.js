import { describe, it, expect } from 'vitest';
import { internalChatDocumentClass } from './internal-chat.js';
class Base { constructor(flags = {}, visible = true) { this.flags = flags; this.baseVisible = visible; } get visible() { return this.baseVisible; } }
const Message = internalChatDocumentClass(Base);
describe('internal authority chat visibility', () => {
  for (const key of ['progressionAuthority', 'inventoryAuthority']) {
    for (const type of ['request', 'result']) it(`hides ${key} ${type} without removing its payload`, () => {
      const flags = { 'osp-houserules': { [key]: { type, operationId: 'keep-me' } } };
      const message = new Message(flags);
      expect(message.visible).toBe(false);
      expect(message.flags).toEqual(flags);
    });
  }
  it('preserves normal chat, spell cards and base whisper permissions', () => {
    expect(new Message().visible).toBe(true);
    expect(new Message({ 'osp-houserules': { spellOperation: 'cast' } }).visible).toBe(true);
    expect(new Message({}, false).visible).toBe(false);
    expect(new Message({ 'osp-houserules': { progressionAuthority: { type: 'other' } } }).visible).toBe(true);
  });
});
