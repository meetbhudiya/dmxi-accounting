import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import javaScriptObfuscator from 'vite-plugin-javascript-obfuscator'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    command === 'build' && javaScriptObfuscator({
      options: {
        identifierNamesGenerator: 'hexadecimal',
        stringArray: true,
        stringArrayEncoding: ['rc4'],
        stringArrayThreshold: 1,
        rotateStringArray: true,
        shuffleStringArray: true,
        stringArrayWrappersCount: 3,
        stringArrayWrappersType: 'function',
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        transformObjectKeys: true,
        unicodeEscapeSequence: true,
        disableConsoleOutput: true,
        selfDefending: true,
        debugProtection: false,
        compact: true,
        renameGlobals: false,
        renameProperties: false,
      }
    }),
  ].filter(Boolean),
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[hash].js',
        entryFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
      },
    },
  },
}))
