/**
 * @file Registers additional Handlebars helpers beyond those in ose.js
 */

export const registerHelpers = () => {
  // Equality check
  Handlebars.registerHelper("eq", (a, b) => a === b);

  // Math helpers
  Handlebars.registerHelper("mod", (a, b) => a % b);
  Handlebars.registerHelper("add", (a, b) => Number(a) + Number(b));
  Handlebars.registerHelper("subtract", (a, b) => Number(a) - Number(b));
  Handlebars.registerHelper("divide", (a, b) => (b !== 0 ? Number(a) / Number(b) : 0));
  Handlebars.registerHelper("mult", (a, b) => Number(a) * Number(b));
  Handlebars.registerHelper("ceil", (a) => Math.ceil(Number(a)));

  // Round weight to 1 decimal
  Handlebars.registerHelper("roundWeight", (value) =>
    Math.round(Number(value) * 10) / 10
  );

  // Counter helper for iterating 0..n-1
  Handlebars.registerHelper("counter", (value, max) => {
    const result = [];
    for (let i = 0; i < max; i++) {
      result.push({ value: i < value });
    }
    return result;
  });

  // Repeat block n times
  Handlebars.registerHelper("times", (n, block) => {
    let result = "";
    for (let i = 0; i < n; i++) {
      result += block.fn(i);
    }
    return result;
  });

  // Get tag icon from CONFIG
  Handlebars.registerHelper("getTagIcon", (tag) => {
    const found = Object.values(CONFIG.OSE.auto_tags).find(
      (t) => t && t.label === tag
    );
    return found ? found.icon : "";
  });

  // Asset path helper
  Handlebars.registerHelper("asset", (assetPath) =>
    `${CONFIG.OSE.assetsPath}/${assetPath}`
  );
};
