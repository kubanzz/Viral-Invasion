import { defineConfig } from 'vite';
export default defineConfig({ base: './', assetsInclude: ['**/*.glb'], server: { port: 5173, strictPort: true } });
