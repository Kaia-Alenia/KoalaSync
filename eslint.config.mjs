export default [
  {
    ignores: ["dist/**", "node_modules/**", "scratch/**"]
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        chrome: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        localStorage: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        CustomEvent: "readonly",
        MutationObserver: "readonly",
        Uint32Array: "readonly",
        Set: "readonly",
        Map: "readonly",
        Promise: "readonly",
        Array: "readonly",
        Object: "readonly",
        JSON: "readonly",
        Math: "readonly",
        Number: "readonly",
        String: "readonly",
        Date: "readonly",
        Error: "readonly",
        URL: "readonly",
        WebSocket: "readonly",
        self: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-unreachable": "error",
      "no-constant-condition": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-empty": "error",
      "no-extra-semi": "error",
      "no-prototype-builtins": "warn",
      "no-unsafe-optional-chaining": "error",
      "valid-typeof": "error"
    }
  },
  {
    files: ["server/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      globals: {
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        module: "readonly",
        exports: "readonly",
        Buffer: "readonly"
      }
    }
  }
];
