import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/^\uFEFF/, ''),
);
const readPngDimensions = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};
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
for (const [terrainId, terrainType] of Object.entries(maps.terrainTypes ?? {})) {
  if (terrainType?.assetId && !sprites[terrainType.assetId]) {
    fail(`terrain type ${terrainId} requires missing manifest ID ${terrainType.assetId}`);
  }
}
for (const map of maps.maps ?? []) {
  const assets = map.assets ?? map;
  const terrainAssets = assets.terrain ?? {};
  const backgroundId = assets.background ?? assets.backgroundAsset;
  for (const id of [
    backgroundId,
    assets.ground ?? assets.groundAsset,
    ...(assets.tiles ?? assets.tileAssets ?? []),
    ...(assets.props ?? assets.propAssets ?? []),
    assets.spawnEdge ?? assets.spawnEdgeAsset,
    terrainAssets.hillCenter,
    terrainAssets.hillEdge,
    terrainAssets.hillCorner,
  ]) {
    if (id && !sprites[id]) fail(`${map.planetId}/${map.regionId} requires missing manifest ID ${id}`);
  }
  if (map.artwork) {
    if (map.terrain?.rows && map.mapId !== 'aurelia/landing-zone') {
      fail(`${map.planetId}/${map.regionId} rows-based artwork is only enabled for aurelia/landing-zone`);
    }
    if (map.terrain?.rows) {
      if (map.terrain.rows.length !== map.world?.rows) {
        fail(`${map.planetId}/${map.regionId} terrain row count must match world.rows`);
      }
      for (const [rowIndex, row] of map.terrain.rows.entries()) {
        if (row.length !== map.world?.columns) {
          fail(`${map.planetId}/${map.regionId} terrain row ${rowIndex} must match world.columns`);
          break;
        }
      }
    }
    const background = sprites[backgroundId];
    const expectedWidth = map.artwork.worldSize?.width;
    const expectedHeight = map.artwork.worldSize?.height;
    if (background && (background.draw.width !== expectedWidth || background.draw.height !== expectedHeight)) {
      fail(`${map.planetId}/${map.regionId} artwork size must match background draw box`);
    }
  }
}

const map1 = (maps.maps ?? []).find((map) => map.mapId === 'aurelia/landing-zone');
if (!map1) {
  fail('aurelia/landing-zone map is missing');
} else {
  const expectedWorld = { cellSize: 18, columns: 160, rows: 120 };
  for (const [key, value] of Object.entries(expectedWorld)) {
    if (map1.world?.[key] !== value) fail(`${map1.mapId}.world.${key} must be ${value}`);
  }
  if (map1.tankCollisionScale !== 0.45) {
    fail(`${map1.mapId}.tankCollisionScale must be 0.45 for the lenient three-tile tank footprint`);
  }
  if (map1.tankCollisionShape !== 'circle') {
    fail(`${map1.mapId}.tankCollisionShape must be circle for corner clearance`);
  }
  if (Array.isArray(map1.terrain?.regions)) {
    fail(`${map1.mapId}.terrain.regions must be absent for tile terrain`);
  }

  const terrainRows = map1.terrain?.rows;
  const openSymbols = Object.entries(map1.terrain?.legend ?? {})
    .filter(([, terrainId]) => terrainId === 'open')
    .map(([symbol]) => symbol);
  const checkOpenCell = (cell, label) => {
    if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
      fail(`${map1.mapId}.${label} must be an integer cell`);
      return;
    }
    const symbol = terrainRows?.[cell.y]?.[cell.x];
    if (!openSymbols.includes(symbol)) {
      fail(`${map1.mapId}.${label} at row ${cell.y}, column ${cell.x} must be an open cell`);
    }
  };

  checkOpenCell(map1.tankStartCell, 'tankStartCell');
  if (!Array.isArray(map1.enemySpawnCells) || map1.enemySpawnCells.length !== 4) {
    fail(`${map1.mapId}.enemySpawnCells must contain exactly 4 cells`);
  } else {
    map1.enemySpawnCells.forEach((cell, index) => checkOpenCell(cell, `enemySpawnCells[${index}]`));
  }

  const map1BackgroundId = map1.assets?.background ?? map1.backgroundAsset;
  const map1Background = sprites[map1BackgroundId];
  if (!map1Background?.src) {
    fail(`${map1.mapId} background asset is missing from the manifest`);
  } else {
    const map1AssetPath = path.resolve(root, 'public', map1Background.src.replace(/^\/+/, ''));
    try {
      const dimensions = readPngDimensions(map1AssetPath);
      if (!dimensions || dimensions.width !== 2880 || dimensions.height !== 2160) {
        fail(`${map1.mapId} final PNG must be 2880x2160`);
      }
    } catch {
      fail(`${map1.mapId} final PNG is missing or unreadable`);
    }
  }

  const converterPath = path.join(root, 'scripts', 'convert-map1-layout.ps1');
  if (!fs.existsSync(converterPath)) fail(`${map1.mapId} layout converter script is missing`);
  const candidateRelativePath = 'scripts/map-source/aurelia-landing-zone-layout-candidate.json';
  const candidatePath = path.join(root, candidateRelativePath);
  if (!fs.existsSync(candidatePath)) {
    fail(`${map1.mapId} source mapping metadata is missing: ${candidateRelativePath}`);
  } else {
    try {
      const candidate = readJson(candidateRelativePath);
      if (candidate.world?.cellSize !== 18 || candidate.world?.columns !== 160 || candidate.world?.rows !== 120) {
        fail(`${map1.mapId} source mapping metadata has an invalid tile contract`);
      }
      const sourceRelativePath = candidate.source?.path;
      if (typeof sourceRelativePath !== 'string' || !sourceRelativePath) {
        fail(`${map1.mapId} source mapping metadata is missing source.path`);
      } else {
        const sourcePath = path.join(root, 'scripts', 'map-source', sourceRelativePath);
        const dimensions = fs.existsSync(sourcePath) ? readPngDimensions(sourcePath) : null;
        if (!dimensions || dimensions.width !== 814 || dimensions.height !== 709) {
          fail(`${map1.mapId} source layout must be 814x709 PNG`);
        }
      }
    } catch {
      fail(`${map1.mapId} source mapping metadata is invalid JSON`);
    }
  }
}

const expectedRegionCounts = {
  'aurelia/relay-fields': 4,
  'cinder/ash-basin': 4,
  'cinder/core-ruins': 7,
  'test/terrain-test': 11,
};
for (const [mapId, expectedCount] of Object.entries(expectedRegionCounts)) {
  const map = (maps.maps ?? []).find((candidate) => candidate.mapId === mapId);
  if (!map) {
    fail(`${mapId} map is missing`);
  } else if (map.terrain?.rows) {
    fail(`${mapId} must keep polygon terrain.regions instead of tile rows`);
  } else if (!Array.isArray(map.terrain?.regions) || map.terrain.regions.length !== expectedCount) {
    fail(`${mapId}.terrain.regions must contain ${expectedCount} regions`);
  }
}

const terrainTest = (maps.maps ?? []).find((map) => map.mapId === 'test/terrain-test');
for (const id of [
  'map.test.terrain-test.background',
  'map.test.terrain-test.spawn-edge',
]) {
  if (!sprites[id]) fail(`terrain-test requires missing manifest ID ${id}`);
}
if (!terrainTest) fail('terrain-test map is missing from maps.json');

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
