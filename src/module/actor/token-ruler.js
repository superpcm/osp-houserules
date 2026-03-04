/**
 * @file OSP Token Ruler — highlights grid cells red when movement is exceeded
 */
export class TokenRulerOSP extends foundry.canvas.placeables.tokens.TokenRuler {
  /** @override */
  _getGridHighlightStyle(cost, distance, ray) {
    // Use tactical movement (encounter movement rate) from OSP data structure
    let moveSpeed = this.token.actor?.system?.movement?.tactical ?? 120;

    // In combat, movement is divided by 3 (one round = 1/3 of tactical)
    if (game.combat?.started) {
      moveSpeed = Math.floor(moveSpeed / 3);
    }

    // Highlight red if cost exceeds move speed
    if (cost > moveSpeed) {
      return { color: 0x990000, alpha: 0.4 };
    }

    return super._getGridHighlightStyle(cost, distance, ray);
  }
}
