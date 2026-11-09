import { defineConfig } from 'vite';
export default defineConfig({
  // 相對路徑：GitHub Pages 專案頁面位於 /<repo>/ 之下
  base: './',
  build: { target: 'es2022' },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
