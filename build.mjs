// Build script: bundles every extension entry point with esbuild into ./dist
// Usage: node build.mjs [--watch]
import { build, context } from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const production = !watch;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });

const options = {
  entryPoints: {
    background: 'src/background/service-worker.js',
    content: 'src/content/content.js',
    popup: 'src/popup/main.jsx',
    options: 'src/options/main.jsx',
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife', // content scripts cannot be ES modules, so every entry is a self-contained IIFE
  target: 'chrome110',
  jsx: 'automatic',
  minify: production,
  sourcemap: production ? false : 'inline',
  define: { 'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development') },
  loader: { '.css': 'css' },
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching for changes… reload the extension at chrome://extensions after each rebuild.');
} else {
  await build(options);
  console.log('Built extension into ./dist – load it via chrome://extensions → Load unpacked.');
}
