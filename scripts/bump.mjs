import fs from 'node:fs';
import { execSync } from 'node:child_process';

const target = process.argv[2] || 'patch';

execSync(`npm version ${target} --no-git-tag-version`, { stdio: 'inherit' });

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const newVersion = pkg.version;

console.log(`\nBuilding v${newVersion}...`);
execSync('npm run build', { stdio: 'inherit' });