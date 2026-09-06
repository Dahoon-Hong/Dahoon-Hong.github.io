import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

const manifest = readJson('src/data/assets.json');
const sprites = manifest && typeof manifest.sprites === 'object' && !Array.isArray(manifest.sprites)
  ? manifest.sprites
  : {};
const entries = Object.entries(sprites);

if (!Number.isInteger(manifest?.version) || manifest.version < 1) {
  fail('manifest version must be a positive integer');
}

const manifestFiles = new Set();
for (const [id, entry] of entries) {
  if (!id.trim()) fail('manifest contains an empty logical ID');
  if (!entry || typeof entry !== 'object') {
    fail(`${id}: entry must be an object`);
    continue;
  }
  if (typeof entry.src !== 'string' || !entry.src.startsWith('/assets/')) {
    fail(`${id}: src must stay under /assets/`);
    continue;
  }

  const relativeAssetPath = entry.src.replace(/^\/+/, '');
  const assetPath = path.resolve(root, 'public', relativeAssetPath);
  const publicRoot = path.resolve(root, 'public');
  if (!assetPath.startsWith(`${publicRoot}${path.sep}`)) {
    fail(`${id}: src escapes public/`);
    continue;
  }
  manifestFiles.add(assetPath);
  if (!fs.existsSync(assetPath)) {
    fail(`${id}: missing file ${entry.src}`);
    continue;
  }

  if (!entry.draw || !Number.isFinite(entry.draw.width) || entry.draw.width <= 0 ||
      !Number.isFinite(entry.draw.height) || entry.draw.height <= 0) {
    fail(`${id}: draw size must be positive`);
  }
  if (!entry.pivot || !Number.isFinite(entry.pivot.x) || entry.pivot.x < 0 || entry.pivot.x > 1 ||
      !Number.isFinite(entry.pivot.y) || entry.pivot.y < 0 || entry.pivot.y > 1) {
    fail(`${id}: pivot must be within 0..1`);
  }
  if (!entry.frames || !Number.isInteger(entry.frames.columns) || entry.frames.columns < 1 ||
      !Number.isInteger(entry.frames.rows) || entry.frames.rows < 1 ||
      !Number.isFinite(entry.frames.duration) || entry.frames.duration < 0) {
    fail(`${id}: frame contract is invalid`);
    continue;
  }
  if (typeof entry.layer !== 'string' || !entry.layer || typeof entry.fallback !== 'string' || !entry.fallback) {
    fail(`${id}: layer and fallback are required`);
  }

  const buffer = fs.readFileSync(assetPath);
  const isPng = buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG';
  if (!isPng) {
    fail(`${id}: only PNG assets are supported by the current loader`);
    continue;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width % entry.frames.columns !== 0 || height % entry.frames.rows !== 0) {
    fail(`${id}: ${width}x${height} cannot be divided into ${entry.frames.columns}x${entry.frames.rows} frames`);
    continue;
  }
  const frameWidth = width / entry.frames.columns;
  const frameHeight = height / entry.frames.rows;
  if (entry.draw.width !== frameWidth || entry.draw.height !== frameHeight) {
    warn(`${id}: draw ${entry.draw.width}x${entry.draw.height} differs from frame ${frameWidth}x${frameHeight}`);
  }
}

const sourceFiles = walk(path.join(root, 'src')).filter((file) => file.endsWith('.ts') || file.endsWith('.json'));
const source = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const literalIds = [...source.matchAll(/[`'\"]((?:tank|enemy|resource|ui|effect|map)\.[a-z0-9_-]+(?:\.[a-z0-9_-]+){2,})[`'\"]/g)]
  .map((match) => match[1]);
for (const id of new Set(literalIds)) {
  if (!sprites[id]) fail(`runtime references missing manifest ID ${id}`);
}

for (const enemyType of ['standard', 'tanker']) {
  for (const state of ['idle', 'hit', 'dead']) {
    const bodyId = `enemy.${enemyType}.${state}`;
    if (!sprites[bodyId]) fail(`enemy state requires missing manifest ID ${bodyId}`);
  }
  const shadowId = `enemy.shadow.${enemyType}`;
  if (!sprites[shadowId]) fail(`enemy shadow requires missing manifest ID ${shadowId}`);
}

const tanksDirectory = path.join(root, 'src', 'data', 'tanks', 'starter');
for (const file of walk(tanksDirectory).filter((candidate) => candidate.endsWith('.json'))) {
  const definition = JSON.parse(fs.readFileSync(file, 'utf8'));
  const moduleIds = new Set(definition.builtinModuleIds ?? []);
  for (const placement of definition.initialCombatModules ?? []) moduleIds.add(placement.moduleId);
  if (definition.id && definition.id !== 'starter') moduleIds.add(definition.id);
  for (const moduleId of moduleIds) {
    const iconId = `ui.icon.${moduleId}`;
    if (!sprites[iconId]) fail(`${path.relative(root, file)} requires missing manifest ID ${iconId}`);
  }
}

const maps = readJson('src/data/maps.json');
for (const map of maps.maps ?? []) {
  for (const id of [map.backgroundAsset, ...(map.tileAssets ?? []), ...(map.propAssets ?? []), map.spawnEdgeAsset]) {
    if (id && !sprites[id]) fail(`${map.planetId}/${map.regionId} requires missing manifest ID ${id}`);
  }
}

const publicAssetRoot = path.join(root, 'public', 'assets', 'game');
for (const file of walk(publicAssetRoot)) {
  if (!manifestFiles.has(path.resolve(file))) warn(`unlisted runtime asset ${path.relative(root, file)}`);
}

const report = {
  manifestVersion: manifest?.version ?? null,
  manifestEntries: entries.length,
  sourceFilesChecked: sourceFiles.length,
  errors,
  warnings,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Art QA ${errors.length === 0 ? 'passed' : 'failed'}: manifest v${report.manifestVersion}, ${report.manifestEntries} entries`);
  console.log(`Errors: ${errors.length}; warnings: ${warnings.length}`);
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  for (const error of errors) console.error(`error: ${error}`);
}

process.exitCode = errors.length === 0 ? 0 : 1;
