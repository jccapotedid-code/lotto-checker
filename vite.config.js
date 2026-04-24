import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// IMPORTANT: set `base` to '/REPO_NAME/' to match your GitHub repo name.
// e.g. if your repo is github.com/jccapote/lotto-checker, base should be '/lotto-checker/'
export default defineConfig({
  plugins: [react()],
  base: '/lotto-checker/',
});
