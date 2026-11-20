// rollup.config.js
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "rollup-plugin-typescript2";

export default {
  input: "src/ose.js",
  output: {
    dir: "dist",
    format: "es",
    sourcemap: process.env.NODE_ENV !== "production",
  },
  plugins: [
    // Stable previews use the bundled catalogs without writing them into the world.
    {
      name: 'bundled-json-catalogs',
      transform(source, id) {
        if (!id.endsWith('.json')) return null;
        return { code: `export default ${JSON.stringify(JSON.parse(source))};`, map: { mappings: '' } };
      }
    },
    // Ensure imports of SCSS in JS don't break the JS bundle; return an empty module for .scss
    {
      name: 'ignore-scss-imports',
      resolveId(source) {
        if (source.endsWith('.scss')) return source;
        return null;
      },
      load(id) {
        if (id.endsWith('.scss')) return 'export default "";';
        return null;
      }
    },
    resolve({
      extensions: [".js", ".ts"],
    }),
    commonjs(),
    typescript({
      tsconfig: "./tsconfig.json",
      clean: true,
    }),
  ],
};
