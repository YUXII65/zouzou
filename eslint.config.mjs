/**
 * ESLint 扁平配置
 *
 * 原先这里用的是 FlatCompat + extends("next/core-web-vitals")，那条路径会加载
 * eslint-config-next 里的 @rushstack/eslint-patch，而该补丁在 ESLint 9.39 上已经失效：
 *   "Failed to patch ESLint because the calling module was not recognized"
 * 结果是 `pnpm lint` 直接崩掉 —— lint 看起来配置好了，实际上从来没跑过。
 *
 * 现在改成直接用插件搭扁平配置。这些插件本来就是 eslint-config-next 的直接依赖，
 * 由 pnpm 的 eslint 公共提升提供，不额外引入新包。
 */
import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "next-env.d.ts",
    // 本地参考资料与临时产物，不参与 lint
    ".atypica/**",
    ".public-demo/**",
    ".public-service/**",
    "tools/**",
    "backups/**",
  ]),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactPlugin.configs.flat.recommended.rules,
      ...tsPlugin.configs.recommended.rules,

      // 显式只保留这两条 hooks 规则：新版 react-hooks 的 recommended 会带上
      // React Compiler 时代的整组规则（如 set-state-in-effect），
      // 对没有启用编译器的代码库是纯噪音，这里按 Next 15 的原有口径配置。
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // 与 eslint-config-next 原设定保持一致
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-no-target-blank": "off",
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
    },
  },
]);
