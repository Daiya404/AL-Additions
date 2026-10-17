import fs from 'node:fs';
import { execSync } from 'node:child_process';

const target = process.argv[2] || 'patch';

execSync(`npm version ${target} --no-git-tag-version`, { stdio: 'inherit' });

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const newVersion = pkg.version;

if (fs.existsSync('vite.config.ts')) {
  let viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
  if (/version:\s*['"`][^'"`]+['"`]/.test(viteConfig)) {
    viteConfig = viteConfig.replace(
      /version:\s*['"`][^'"`]+['"`]/,
      `version: '${newVersion}'`
    );
    fs.writeFileSync('vite.config.ts', viteConfig, 'utf8');
    console.log(`Updated vite.config.ts -> ${newVersion}`);
  }
}

console.log(`\nBuilding v${newVersion}...`);
execSync('npm run build', { stdio: 'inherit' });