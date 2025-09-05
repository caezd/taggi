import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import css from "rollup-plugin-css-only";
import terser from "@rollup/plugin-terser";

export default [
  {
    input: "src/index.js",
    output: [
      {
        file: "dist/taggi.esm.js",
        format: "esm",
        sourcemap: true,
      },
      {
        file: "dist/taggi.js",
        format: "iife",
        name: "Taggi",
        sourcemap: true,
      },
    ],
    plugins: [resolve(), commonjs(), css({ output: "bundle.css" }), terser()],
  },
];
