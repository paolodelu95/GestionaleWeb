// Prepara la build offline: compila il frontend Angular (config "offline") e
// copia l'output dentro backend/public, da dove il server Express lo serve.
// Uso: node build.mjs   (oppure `npm run build` in questa cartella)
import { execSync } from 'node:child_process';
import { existsSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = join(root, 'frontend');
const dist = join(frontend, 'dist', 'frontend', 'browser');
const target = join(root, 'backend', 'public');

console.log('▶ Build frontend (configuration: offline)…');
execSync('npx ng build --configuration offline', { cwd: frontend, stdio: 'inherit' });

if (!existsSync(dist)) {
  console.error(`✗ Output non trovato in ${dist} — controlla outputPath di angular.json`);
  process.exit(1);
}

console.log(`▶ Copio ${dist} → ${target}`);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(dist, target, { recursive: true });

console.log('✓ Pronto. Avvia l\'app con:  npm start');
