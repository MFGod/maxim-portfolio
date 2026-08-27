import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Скрипты хуков редактора и агентов — не часть приложения.
    '.claude/**',
    '.cursor/**',
    // Ассеты мира: сторонние сборочные артефакты, в том числе декодер draco.
    'public/world/**',
  ]),
]);

export default eslintConfig;
