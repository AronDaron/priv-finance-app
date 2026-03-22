#!/usr/bin/env node
'use strict';

/**
 * build-win.cjs
 * Buduje instalator Windows (.exe) z Linuxa bez Wine.
 * Pobiera prebuilt better-sqlite3 dla Windows, zamienia .node file,
 * uruchamia electron-vite build + electron-builder, przywraca oryginał.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release');
const NODE_FILE = path.join(RELEASE_DIR, 'better_sqlite3.node');
const LINUX_BACKUP = path.join(RELEASE_DIR, 'better_sqlite3.node.linux');

// better-sqlite3 v12.8.0, Electron 41 = modules v145, win32-x64
const PREBUILD_URL =
  'https://github.com/WiseLibs/better-sqlite3/releases/download/v12.8.0/' +
  'better-sqlite3-v12.8.0-electron-v145-win32-x64.tar.gz';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} dla ${u}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

async function main() {
  console.log('\n=== Windows Build Script ===\n');

  // 1. Pobierz prebuild
  const tmpTar = path.join(os.tmpdir(), 'better-sqlite3-win32.tar.gz');
  console.log('↓ Pobieranie prebuilt better-sqlite3 dla Windows...');
  await download(PREBUILD_URL, tmpTar);
  console.log('  ✓ Pobrano:', tmpTar);

  // 2. Wyekstrahuj .node do tmp dir
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite3-'));
  execSync(`tar -xzf "${tmpTar}" -C "${tmpDir}"`, { stdio: 'pipe' });
  fs.unlinkSync(tmpTar);

  const winNodeFile = execSync(`find "${tmpDir}" -name "*.node"`)
    .toString()
    .trim();
  if (!winNodeFile) throw new Error('Nie znaleziono .node w archiwum prebuilt!');
  console.log('  ✓ Wyekstrahowano:', path.basename(winNodeFile));

  // 3. Zamień Linux .node → Windows .node (z backupem)
  if (fs.existsSync(NODE_FILE)) {
    fs.copyFileSync(NODE_FILE, LINUX_BACKUP);
    console.log('  ✓ Backup Linux .node zapisany');
  }
  fs.copyFileSync(winNodeFile, NODE_FILE);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('  ✓ Windows .node zainstalowany\n');

  // 4. Build
  try {
    console.log('🔨 electron-vite build...');
    execSync('npx electron-vite build', { stdio: 'inherit', cwd: ROOT });
    console.log('\n🔨 electron-builder (NSIS, win32)...');
    execSync('xvfb-run --auto-servernum npx electron-builder --win --x64', {
      stdio: 'inherit',
      cwd: ROOT,
      env: { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' },
    });
    console.log('\n✅ Build zakończony! Instalator w: dist/');
  } finally {
    // 5. Przywróć Linux .node (zawsze, nawet przy błędzie)
    if (fs.existsSync(LINUX_BACKUP)) {
      fs.copyFileSync(LINUX_BACKUP, NODE_FILE);
      fs.unlinkSync(LINUX_BACKUP);
      console.log('\n  ✓ Linux .node przywrócony (npm run dev działa normalnie)');
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Błąd buildu:', err.message);
  process.exit(1);
});
