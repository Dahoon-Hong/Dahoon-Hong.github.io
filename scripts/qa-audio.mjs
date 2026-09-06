import fs from 'node:fs';

const manifestPath = new URL('../src/data/audio.json', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const requiredIds = [
  'sfx.weapon.direct-fire',
  'sfx.weapon.arc-fire',
  'sfx.weapon.impact',
  'sfx.weapon.explosion',
  'sfx.enemy.death',
  'sfx.ui.upgrade-confirm',
];
const errors = [];

if (manifest.version !== 1) errors.push('Audio manifest version must be 1.');
if (!manifest.sounds || typeof manifest.sounds !== 'object') {
  errors.push('Audio manifest is missing sounds.');
} else {
  for (const id of requiredIds) {
    const entry = manifest.sounds[id];
    if (!entry) {
      errors.push('Missing audio entry: ' + id);
      continue;
    }
    if (entry.kind !== 'sfx' || entry.bus !== 'sfx') errors.push('Invalid kind or bus: ' + id);
    if (entry.licenseStatus !== 'approved') errors.push('Audio entry is not approved: ' + id);
    if (typeof entry.src !== 'string' || !entry.src.startsWith('procedural://')) {
      errors.push('Audio entry is not procedural: ' + id);
    }
    if (entry.licenseName !== 'Direct synthesis (project-authored)') {
      errors.push('Audio entry has an unexpected license name: ' + id);
    }
    if (entry.attribution !== 'No third-party asset') {
      errors.push('Audio entry attribution is incomplete: ' + id);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Audio QA passed: ' + requiredIds.length + ' approved procedural effects.');
