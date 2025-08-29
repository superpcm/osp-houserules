// rollup.config.js
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "rollup-plugin-typescript2";
import * as sass from "sass";
import { resolve as resolvePath } from 'path';

export default {
  input: "src/ose.js",
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true,
  },
  plugins: [
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
  // ...existing code...
  ],
};
