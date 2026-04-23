import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        leaderboard: resolve(__dirname, "leaderboard.html"),
        earn: resolve(__dirname, "earn.html"),
      },
    },
  },
});
