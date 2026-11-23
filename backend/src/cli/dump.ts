/**
 * Membekukan apa yang dilihat antarmuka ke berkas JSON.
 *
 * Skrip ini tidak menghitung ulang apa pun. Ia membangun server yang sama,
 * memanggil rute yang sama, lalu menyimpan jawabannya. Jadi angka di berkas
 * bukti tidak mungkin berbeda dari angka di layar.
 *
 * Jalankan: npm run dump -w backend -- <direktori-tujuan>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildServer } from '../api/server.js';
import { DB_PATH } from '../config.js';

const target = resolve(process.argv[2] ?? join('proof', 'out'));
mkdirSync(target, { recursive: true });

const app = buildServer(DB_PATH);

const routes: Array<{ file: string; url: string }> = [
  { file: 'portfolio.json', url: '/api/portfolio' },
  { file: 'issues.json', url: '/api/issues' },
  { file: 'source-inventory.json', url: '/api/source-inventory' },
  { file: 'healthz.json', url: '/healthz' },
];

try {
  for (const route of routes) {
    const res = await app.inject({ method: 'GET', url: route.url });
    if (res.statusCode !== 200) {
      throw new Error(`${route.url} menjawab ${res.statusCode}`);
    }
    const body = res.json();
    writeFileSync(join(target, route.file), JSON.stringify(body, null, 2) + '\n', 'utf8');
    console.log(`${route.file}  ${route.url}  ${res.statusCode}`);
  }
} finally {
  await app.close();
}
