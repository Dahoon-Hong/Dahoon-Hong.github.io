import fs from 'node:fs';

const manifestPath = new URL('../src/data/audio.json', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const requiredEntries = [
  { id: 'sfx.weapon.direct-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.arc-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.impact', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.explosion', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.enemy.death', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.ui.upgrade-confirm', kind: 'sfx', bus: 'sfx' },
  { id: 'music.gameplay.default', kind: 'music', bus: 'music' },
];
const errors = [];

if (manifest.version !== 1) errors.push('Audio manifest version must be 1.');
if (!manifest.sounds || typeof manifest.sounds !== 'object') {
  errors.push('Audio manifest is missing sounds.');
} else {
  for (const required of requiredEntries) {
    const entry = manifest.sounds[required.id];
    if (!entry) {
      errors.push('Missing audio entry: ' + required.id);
      continue;
    }
    if (entry.kind !== required.kind || entry.bus !== required.bus) errors.push('Invalid kind or bus: ' + required.id);
    if (entry.licenseStatus !== 'approved') errors.push('Audio entry is not approved: ' + required.id);
    if (typeof entry.src !== 'string' || !entry.src.startsWith('procedural://')) {
      errors.push('Audio entry is not procedural: ' + required.id);
    }
    if (entry.licenseName !== 'Direct synthesis (project-authored)') {
      errors.push('Audio entry has an unexpected license name: ' + required.id);
    }
    if (entry.attribution !== 'No third-party asset') {
      errors.push('Audio entry attribution is incomplete: ' + required.id);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Audio QA passed: ' + requiredEntries.length + ' approved procedural entries.');
