import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Imperative three.js mutation (uniforms, scene.environment) inside
    // useFrame/useEffect is the R3F idiom; the react-compiler immutability
    // rule false-positives on it. Scoped to GL components only.
    files: ["src/components/gl/**"],
    rules: { "react-hooks/immutability": "off" },
  },
  {
    // Bake-time-only modules must never reach client code (bundle safety).
    files: ["src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "three/examples/jsm/loaders/SVGLoader*",
                "three/addons/loaders/SVGLoader*",
              ],
              message:
                "Bake-time only — run pnpm bake:monogram; never bundle SVGLoader.",
            },
            {
              group: ["jsdom"],
              message: "Bake-time only — never bundle jsdom.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
