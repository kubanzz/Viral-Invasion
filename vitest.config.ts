import { defineConfig } from 'vitest/config';
export default defineConfig({ assetsInclude: ['**/*.glb'], test: { include: ['tests/unit/**/*.test.ts'], reporters: ['default', 'json'], outputFile: { json: 'artifacts/unit-generated/unit-results.json' } } });
