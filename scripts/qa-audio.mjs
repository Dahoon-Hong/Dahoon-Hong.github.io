import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const manifestPath = new URL('../src/data/audio.json', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
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
  'Public domain (DVIDS)',
  'User-provided with distribution permission',
]);
const errors = [];
let proceduralCount = 0;
let externalCount = 0;

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
    const isProcedural = typeof entry.src === 'string' && entry.src.startsWith('procedural://');
    if (isProcedural) {
      proceduralCount += 1;
      if (entry.licenseName !== 'Direct synthesis (project-authored)') {
        errors.push('Audio entry has an unexpected procedural license name: ' + required.id);
      }
      if (entry.attribution !== 'No third-party asset') {
        errors.push('Audio entry attribution is incomplete: ' + required.id);
      }
      continue;
    }

    externalCount += 1;
    const src = typeof entry.src === 'string' ? entry.src : '';
    if (!src.startsWith('/assets/')) {
      errors.push('External audio entry must use a public asset path: ' + required.id);
      continue;
    }
    if (!approvedLicenseNames.has(entry.licenseName)) {
      errors.push('Audio entry has an unexpected license name: ' + required.id);
    }
    if (required.kind === 'sfx' && entry.licenseName !== 'Public domain (DVIDS)') {
      errors.push('External SFX entry is not approved public domain: ' + required.id);
    }
    if (required.kind === 'music' && !src.startsWith('/assets/game/audio/')) {
      errors.push('Bundled music entry must use the game audio path: ' + required.id);
    }
    if (required.kind === 'sfx' && (!/^https:\/\//.test(entry.sourceUrl) || entry.licenseUrl !== 'https://www.dvidshub.net/about/copyright')) {
      errors.push('External SFX entry is missing DVIDS provenance URLs: ' + required.id);
    }
    if (typeof entry.sourceUrl !== 'string' || typeof entry.licenseUrl !== 'string' ||
      !entry.sourceUrl || !entry.licenseUrl ||
      !/^[a-f0-9]{64}$/i.test(entry.originalSha256) || !/^[a-f0-9]{64}$/i.test(entry.runtimeSha256)) {
      errors.push('External audio entry has invalid SHA-256 metadata: ' + required.id);
    }
    const attributionValid = entry.licenseName === 'User-provided with distribution permission'
      ? entry.attribution === 'User-provided music'
      : typeof entry.attribution === 'string' && entry.attribution.length > 0;
    if (!attributionValid) {
      errors.push('External audio entry attribution is incomplete: ' + required.id);
    }
    const assetPath = fileURLToPath(new URL('../public' + src, import.meta.url));
    if (!fs.existsSync(assetPath)) {
      errors.push('Missing external audio file: ' + assetPath);
      continue;
    }
    const runtimeSha256 = createHash('sha256').update(fs.readFileSync(assetPath)).digest('hex');
    if (runtimeSha256.toLowerCase() !== String(entry.runtimeSha256).toLowerCase()) {
      errors.push('External audio runtime hash mismatch: ' + required.id);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Audio QA passed: ' + requiredEntries.length + ' approved entries (' + proceduralCount + ' procedural, ' + externalCount + ' external).');
