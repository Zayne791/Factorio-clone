// Build: bundle TypeScript with esbuild into docs/ (served by GitHub Pages), generate service worker.
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'docs');
const serve = process.argv.includes('--serve');
const dev = process.argv.includes('--dev') || serve;

fs.mkdirSync(out, { recursive: true });
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

async function build() {
  const t0 = Date.now();
  await esbuild.build({
    entryPoints: [path.join(root, 'src/main.ts')],
    bundle: true, minify: !dev, sourcemap: dev ? 'inline' : false,
    target: ['safari15', 'chrome100'], format: 'iife',
    outfile: path.join(out, 'game.js'), logLevel: 'warning',
  });
  copyDir(path.join(root, 'public'), out);
  fs.copyFileSync(path.join(root, 'src/ui/style.css'), path.join(out, 'style.css'));
  // service worker
  const files = [];
  const walk = (d, rel = '') => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), r = rel ? rel + '/' + f : f; if (fs.statSync(p).isDirectory()) walk(p, r); else if (f !== 'sw.js' && !f.endsWith('.txt') && f !== 'CNAME' && f !== '.nojekyll') files.push(r); } };
  walk(out);
  const hash = crypto.createHash('sha1');
  for (const f of files.sort()) hash.update(f + fs.readFileSync(path.join(out, f)).length + crypto.createHash('md5').update(fs.readFileSync(path.join(out, f))).digest('hex'));
  const version = hash.digest('hex').slice(0, 12);
  const list = ['./', ...files.map(f => './' + f)];
  const sw = fs.readFileSync(path.join(root, 'tools/sw-template.js'), 'utf8').replace('__VERSION__', version).replace('__FILES__', JSON.stringify(list));
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  console.log(`built in ${Date.now() - t0}ms, version ${version}, ${files.length} files, game.js ${(fs.statSync(path.join(out, 'game.js')).size / 1024).toFixed(0)} KB`);
}
await build();
if (serve) {
  const port = 8080;
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(out, p);
    if (!f.startsWith(out) || !fs.existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, () => console.log('serving on http://localhost:' + port));
}
