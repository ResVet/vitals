// Turns dist/ into a preview bundle for a hosted page that supplies its own
// <html>, <head> and <body>: keeps the head's title, links and scripts, then
// the body, and marks the page as a preview (the contact form is switched off).
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const out = new URL('../.preview/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const html = readFileSync(new URL('index.html', dist), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = head
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<meta (property|name)="(og|twitter):[^>]*>\s*/gi, '')
  .replace(/<meta name="theme-color"[^>]*>\s*/gi, '');
const page = `<script>document.documentElement.dataset.preview = 'artifact';</script>\n${keep.trim()}\n${body.trim()}\n`;
writeFileSync(new URL('index.html', out), page);
cpSync(new URL('assets/', dist), new URL('assets/', out), { recursive: true });
cpSync(new URL('favicon.svg', dist), new URL('favicon.svg', out));
const files = readdirSync(new URL('assets/', out)).map((f) => `assets/${f}`);
writeFileSync(new URL('files.json', out), JSON.stringify(Object.fromEntries([...files, 'favicon.svg'].map((f) => [f, `.preview/${f}`])), null, 2));
console.log(`preview: ${files.length + 1} files`);
