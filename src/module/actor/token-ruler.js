/**
 * @file OSP Token Ruler — highlights grid cells red when movement is exceeded
 */
export class TokenRulerOSP extends foundry.canvas.placeables.tokens.TokenRuler {
  /** @override */
  _getGridHighlightStyle(cost, distance, ray) {
    const movement = this.token.actor?.system?.movement;
    const moveSpeed = game.combat?.started
      ? (movement?.tactical ?? 40)
      : (movement?.overland ?? 120);

    // Highlight red if cost exceeds move speed
    if (cost > moveSpeed) {
      return { color: 0x990000, alpha: 0.4 };
    }

    return super._getGridHighlightStyle(cost, distance, ray);
  }
}
