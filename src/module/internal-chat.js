/** Internal authority envelopes remain documents, but are never chat cards. */
export function isInternalAuthorityMessage(message) {
  const flags = message?.flags?.['osp-houserules'];
  return ['progressionAuthority', 'inventoryAuthority'].some(key => {
    const payload = flags?.[key];
    return payload?.type === 'request' || payload?.type === 'result';
  });
}
export function internalChatDocumentClass(Base) {
  return class OspChatMessage extends Base {
    get visible() { return !isInternalAuthorityMessage(this) && super.visible; }
  };
}
