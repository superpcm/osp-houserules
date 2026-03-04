/**
 * @file Helper functions for the party system
 */
import { OspPartySheet } from "./party/party-sheet.js";

/**
 * Adds a party sheet control button to the Actors Directory sidebar
 */
export const addControl = (object, html) => {
  const partyButton = document.createElement("button");
  partyButton.className = "osp-party-button";
  partyButton.title = game.i18n.localize("OSE.party.title");
  partyButton.innerHTML = '<i class="fas fa-users"></i>';

  partyButton.addEventListener("click", () => {
    new OspPartySheet().render(true);
  });

  html.querySelector(".directory-header .action-buttons")?.appendChild(partyButton);
};

/**
 * Re-renders the party sheet when actors with party flags change
 */
export const update = (actor, data) => {
  // Only care about actors with the party flag
  if (!actor.getFlag(game.system.id, "party")) return;

  // Find the party sheet if open and refresh it
  const partySheet = Object.values(ui.windows).find(
    (w) => w instanceof OspPartySheet
  );
  if (partySheet?.rendered) partySheet.render(false);
};
