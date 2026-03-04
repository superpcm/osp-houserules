/**
 * @file The data model for Items of type Spell
 */
export default class OspDataModelSpell extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const {
      StringField,
      NumberField,
      BooleanField,
      ArrayField,
      ObjectField,
    } = foundry.data.fields;
    return {
      save: new StringField(),
      lvl: new NumberField({ integer: true, min: 1, initial: 1 }),
      class: new StringField(),
      duration: new StringField(),
      range: new StringField(),
      roll: new StringField(),
      memorized: new BooleanField(),
      cast: new BooleanField(),
      description: new StringField(),
      tags: new ArrayField(new ObjectField()),
    };
  }

  get #rollTag() {
    if (!this.roll) return null;
    return { label: this.roll, icon: "fa-dice" };
  }

  get #saveTag() {
    if (!this.save) return null;
    return {
      label: CONFIG.OSE.saves_long[this.save],
      icon: "fa-skull",
    };
  }

  get manualTags() {
    if (!this.tags) return null;
    const tagNames = new Set(
      Object.values(CONFIG.OSE.auto_tags).map(({ label }) => label)
    );
    return this.tags.filter(({ value }) => !tagNames.has(value));
  }

  get autoTags() {
    return [
      this.class ? { label: this.class, icon: "fa-book" } : null,
      this.range ? { label: this.range, icon: "fa-ruler" } : null,
      this.duration ? { label: this.duration, icon: "fa-clock" } : null,
      this.#rollTag,
      this.#saveTag,
      ...(this.manualTags ?? []),
    ]
      .flat()
      .filter((t) => !!t);
  }
}
