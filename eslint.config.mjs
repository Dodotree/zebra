import html from "eslint-plugin-html";
import globals from "globals";
import pluginJs from "@eslint/js";
import js from "@eslint/js";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

const browserGlobals = globals.browser;
browserGlobals.screen = true;

export default [
    ...compat.extends(
        "airbnb-base/legacy",
        "plugin:wc/recommended",
        "plugin:lit/recommended"
    ),
    pluginJs.configs.recommended,
    {
        plugins: {
            html,
        },
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.browser },
        },
        rules: {
            indent: ["error", 4],
            "linebreak-style": ["error", "unix"],
            quotes: ["error", "double"],
            semi: ["error", "always"],
            "comma-dangle": [
                "error",
                {
                    arrays: "only-multiline",
                    objects: "only-multiline",
                    imports: "never",
                    exports: "never",
                    functions: "never",
                },
            ],
        },
    },
];
