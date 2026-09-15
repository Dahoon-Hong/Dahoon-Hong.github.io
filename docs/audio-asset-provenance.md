# Audio asset provenance

Review date: 2026-09-15

The manifest of record is `src/data/audio.json`. Detailed source URLs, extraction windows, and hashes for the external clips are recorded in [`docs/audio-licenses/dvids-weapon-fire.md`](audio-licenses/dvids-weapon-fire.md).

| ID | Runtime asset | Source/license | Notes |
| --- | --- | --- | --- |
| sfx.weapon.hmg-12-7-fire | `weapon-hmg-12-7-fire.wav` | DVIDS public domain | Connected multi-round .50 caliber burst |
| sfx.weapon.autocannon-20-fire | `weapon-autocannon-20-fire.wav` | DVIDS public domain | Connected 20mm burst |
| sfx.weapon.aa-30-fire | `weapon-aa-30-fire.wav` | DVIDS public domain | Connected 30mm burst |
| sfx.weapon.mortar-60-fire | `weapon-mortar-60-fire.wav` | DVIDS public domain | 60mm mortar firing clip |
| sfx.weapon.rifle-76-fire | `weapon-rifle-76-fire.wav` | DVIDS public domain | 76mm cannon firing clip |
| sfx.weapon.rifle-90-fire | `weapon-howitzer-105-fire.wav` | DVIDS public domain | Intentionally reuses the 105mm clip per the project caliber mapping |
| sfx.weapon.howitzer-105-fire | `weapon-howitzer-105-fire.wav` | DVIDS public domain | 105mm howitzer firing clip |
| sfx.weapon.smoothbore-120-fire | `weapon-smoothbore-120-fire.wav` | DVIDS public domain | Abrams 120mm firing clip |
| sfx.weapon.howitzer-155-fire | `weapon-howitzer-155-fire.wav` | DVIDS public domain | 155mm howitzer firing clip |

The remaining entries (`direct-fire`, `arc-fire`, `impact`, `explosion`, `enemy.death`, `ui.upgrade-confirm`, and gameplay music) remain project-authored procedural synthesis with no third-party source file.

`npm run qa:audio` rejects missing, unapproved, unprovenanced, or hash-mismatched entries.
