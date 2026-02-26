import { defineConfig } from 'vite-plus'

export default defineConfig({
  fmt: {
    semi: false,
    singleQuote: true,
  },
  pack: {
    entry: ['./src/index.ts', 'src/cli/index.ts'],
  },
})
