/**
 * @file The data model for Items of type Ability
 */
export default class OspDataModelAbility extends foundry.abstract.TypeDataModel {
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
      pattern: new StringField(),
      requirements: new StringField(),
      roll: new StringField(),
      rollType: new StringField({ initial: "result" }),
      rollTarget: new NumberField({ nullable: true, initial: null }),
      blindroll: new BooleanField(),
      description: new StringField(),
      tags: new ArrayField(new ObjectField()),
    };
  }

  get #rollTag() {
    if (!this.roll) return null;
    const formula = CONFIG.OSE.roll_type
      ? `${CONFIG.OSE.roll_type[this.rollType] ?? ""}${this.rollTarget ?? ""}`
      : "";
    return { label: `${this.roll} ${formula}`.trim(), icon: "fa-dice" };
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
      this.requirements ? { label: this.requirements, icon: "fa-user" } : null,
      this.#rollTag,
      this.#saveTag,
      ...(this.manualTags ?? []),
    ]
      .flat()
      .filter((t) => !!t);
  }
}
