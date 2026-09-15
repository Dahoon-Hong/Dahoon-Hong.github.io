import fs from 'node:fs';

const manifestPath = new URL('../src/data/audio.json', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const publicRoot = new URL('../public/', import.meta.url);
const requiredEntries = [
  { id: 'sfx.weapon.direct-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.arc-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.hmg-12-7-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.autocannon-20-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.aa-30-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.rifle-76-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.rifle-90-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.smoothbore-120-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.mortar-60-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.howitzer-105-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.howitzer-155-fire', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.impact', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.weapon.explosion', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.enemy.death', kind: 'sfx', bus: 'sfx' },
  { id: 'sfx.ui.upgrade-confirm', kind: 'sfx', bus: 'sfx' },
  { id: 'music.main-menu', kind: 'music', bus: 'music' },
  { id: 'music.gameplay.default', kind: 'music', bus: 'music' },
  { id: 'music.gameplay.test', kind: 'music', bus: 'music' },
];
const approvedLicenseNames = new Set([
  'Direct synthesis (project-authored)',
  'User-provided with distribution permission',
]);
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
    const src = typeof entry.src === 'string' ? entry.src : '';
    const isProcedural = src.startsWith('procedural://');
    const isBundledMusic = required.kind === 'music' && src.startsWith('/assets/game/audio/');
    if (required.kind === 'sfx' && !isProcedural) {
      errors.push('SFX entry is not procedural: ' + required.id);
    }
    if (required.kind === 'music' && !isProcedural && !isBundledMusic) {
      errors.push('Music entry is not procedural or bundled: ' + required.id);
    }
    if (isBundledMusic && !fs.existsSync(new URL(src.slice(1), publicRoot))) {
      errors.push('Bundled music file is missing: ' + required.id);
    }
    if (!approvedLicenseNames.has(entry.licenseName)) {
      errors.push('Audio entry has an unexpected license name: ' + required.id);
    }
    const expectedAttribution = isProcedural ? 'No third-party asset' : 'User-provided music';
    if (entry.attribution !== expectedAttribution) {
      errors.push('Audio entry attribution is incomplete: ' + required.id);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Audio QA passed: ' + requiredEntries.length + ' approved entries.');
