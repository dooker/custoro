import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
    {
        ignores: ["dist/**"]
    },
    {
        languageOptions: {
            globals: {
                ...globals.node
            }
        }
    },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,

    {
        rules: {
            "@typescript-eslint/no-require-imports": "error",
            "no-undef": "error"
        }
    },

    {
        files: ["**/*.ts"],
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_"
                }
            ]
        }
    },

    eslintConfigPrettier,

    {
        files: ["config/**/*.js", "scripts/**/*.js"],
        rules: {
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-unused-vars": "off"
        }
    },

    {
        files: ["migrations/**/*.js"],
        rules: {
            "@typescript-eslint/no-unused-vars": "off"
        }
    }
];
