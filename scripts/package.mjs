// Builds the game and packs it as a zip that can be uploaded to a static host or a web game
// portal as it is. Run: npm run package
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
execSync('npm run build', { stdio: 'inherit' });

// The site must work from any folder: nothing in the page may be loaded from the server's root.
const html = readFileSync('dist/index.html', 'utf8');
const rooted = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
if (rooted.length) {
  console.error(`dist/index.html loads from the server root: ${rooted.join(', ')}`);
  process.exit(1);
}

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else files.push([path, statSync(path).size]);
  }
};
walk('dist');
const total = files.reduce((sum, [, size]) => sum + size, 0);
for (const [path, size] of files.sort((a, b) => b[1] - a[1])) {
  console.log(`${(size / 1024).toFixed(0).padStart(7)} kB  ${path}`);
}
console.log(`${(total / 1024 / 1024).toFixed(2)} MB in ${files.length} files`);

mkdirSync('release', { recursive: true });
const zip = join('release', `${name}-${version}-web.zip`);
if (existsSync(zip)) rmSync(zip);
try {
  // index.html has to be at the top of the archive, so zip from inside dist.
  execFileSync('zip', ['-r', '-q', '-9', join('..', zip), '.'], { cwd: 'dist' });
} catch {
  console.error('Could not run "zip". The built site is in dist/: pack that folder by hand.');
  process.exit(1);
}
console.log(`${zip}: ${(statSync(zip).size / 1024 / 1024).toFixed(2)} MB`);
