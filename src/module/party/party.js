/**
 * @file OSP Party - helper class for tracking the active party
 */
export class OspParty {
  /**
   * Get all actors currently flagged as party members
   * @returns {Array<Actor>}
   */
  static get currentParty() {
    return game.actors.filter(
      (actor) =>
        actor.type === "character" &&
        actor.getFlag(game.system.id, "party") === true
    );
  }

  /**
   * Add an actor to the party
   * @param {Actor} actor
   */
  static async addToParty(actor) {
    return actor.setFlag(game.system.id, "party", true);
  }

  /**
   * Remove an actor from the party
   * @param {Actor} actor
   */
  static async removeFromParty(actor) {
    return actor.unsetFlag(game.system.id, "party");
  }
}
