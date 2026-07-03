/**
 * Tracks the world Item currently being dragged from Foundry's Items sidebar directory.
 * dataTransfer payloads set by Foundry's own drag handlers aren't readable until the drop
 * event fires (browser security), so sheet dragenter/dragover handlers can't synchronously
 * validate a cross-window drag by reading dataTransfer. Capturing the source element's
 * data-entry-id at dragstart time — the same instant Foundry's own handler reads it — lets
 * us look the Item up directly and give sheets something to validate against for
 * drop-target highlighting.
 */
export const externalDrag = { item: null };

export function initExternalDragTracker() {
  document.addEventListener('dragstart', (e) => {
    const el = e.target.closest?.('.directory-item[data-entry-id]');
    externalDrag.item = el ? (game.items.get(el.dataset.entryId) ?? null) : null;
  }, { capture: true });

  document.addEventListener('dragend', () => {
    externalDrag.item = null;
  }, { capture: true });
}
