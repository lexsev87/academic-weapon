// Turns the Vite web build into one self-contained page for a claude.ai Artifact:
// no <html>/<head>/<body> (the platform wraps it), title and styles first, JS inlined.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-web');
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const jsPath = html.match(/<script type="module"[^>]*src="\.\/([^"]+)"/)?.[1];
const cssPath = html.match(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/)?.[1];
const themeScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!jsPath || !cssPath || !themeScript) throw new Error('Unexpected dist-web/index.html: run `vite build --mode web` first.');

const js = readFileSync(join(dist, jsPath), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(dist, cssPath), 'utf8').replace(/<\/style/gi, '<\\/style');

const page = `<title>Academic Weapon</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Tracker dello studio: pomodoro, esami, calendario e statistiche. Versione beta.">
<script>${themeScript.trim()}</script>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
const out = join(dist, 'academic-weapon.html');
writeFileSync(out, page);
console.log(`web: ${out} (${Math.round(page.length / 1024)} KB)`);
