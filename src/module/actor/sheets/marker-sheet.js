/** Minimal sheet for map-only party position markers. */
export class OspActorSheetMarker extends foundry.appv1.sheets.ActorSheet {
  static PIN_IMAGES = ["moonwake", "foxtrail", "oakwatch", "amethyst", "sunward", "frostwind", "nightstar", "roseguard", "tideward", "ember-fork", "edvin", "fung", "myr", "bianca", "madoc"];
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["osp", "sheet", "actor", "marker"],
      template: "systems/osp-houserules/templates/actors/marker-sheet.html",
      width: 360,
      height: "auto",
      resizable: false,
      popOut: true
    });
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    if (this.actor.isOwner || game.user?.isGM) {
      buttons.unshift({
        label: "Token",
        class: "configure-token",
        icon: "fas fa-map-marker-alt",
        onclick: () => this.actor.prototypeToken?.sheet?.render(true)
      });
    }
    return buttons;
  }

  async getData(options) {
    const context = await super.getData(options);
    const current = this.actor.token?.texture?.src || this.actor.prototypeToken?.texture?.src || '';
    const texture = this.actor.token?.texture || this.actor.prototypeToken?.texture || {};
    context.markerScale = Math.min(4, Math.max(0.25, Math.abs(Number(texture.scaleX) || 1)));
    context.markerPins = OspActorSheetMarker.PIN_IMAGES.map(name => ({
      name,
      src: `systems/osp-houserules/assets/tokens/painted-party-pins/${name}.webp`,
      selected: current === `systems/osp-houserules/assets/tokens/painted-party-pins/${name}.webp`
    }));
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-marker-scale]').on('change', async (event) => {
      if (!this.actor.isOwner && !game.user?.isGM) return;
      const value = Math.min(4, Math.max(0.25, Number(event.currentTarget.value) || 1));
      const texture = this.actor.token?.texture || this.actor.prototypeToken?.texture || {};
      const sx = Number(texture.scaleX) || 1;
      const sy = Number(texture.scaleY) || 1;
      const update = { 'texture.scaleX': Math.sign(sx || 1) * value, 'texture.scaleY': Math.sign(sy || 1) * value };
      if (this.actor.token) {
        const tx = this.actor.token.texture || {};
        await this.actor.token.update({ 'texture.scaleX': Math.sign(Number(tx.scaleX) || 1) * value, 'texture.scaleY': Math.sign(Number(tx.scaleY) || 1) * value });
      } else {
        const tokens = (game.scenes?.contents || []).flatMap(scene => [...scene.tokens].filter(token => token.actorId === this.actor.id && token.actorLink));
        await this.actor.update({ 'prototypeToken.texture.scaleX': update['texture.scaleX'], 'prototypeToken.texture.scaleY': update['texture.scaleY'] });
        await Promise.all(tokens.map(token => { const tx = token.texture || {}; return token.update({ 'texture.scaleX': Math.sign(Number(tx.scaleX) || 1) * value, 'texture.scaleY': Math.sign(Number(tx.scaleY) || 1) * value }); }));
      }
      const output = html.find('[data-marker-scale-value]');
      if (output.length) output.text(value.toFixed(2));
      this.render(false);
    });
    html.find('[data-marker-pin]').on('click', async (event) => {
      if (!this.actor.isOwner && !game.user?.isGM) return;
      const src = event.currentTarget.dataset.markerPin;
      if (this.actor.token) await this.actor.token.update({ 'texture.src': src });
      else await this.actor.update({ 'prototypeToken.texture.src': src });
      this.render(false);
    });
  }
}
