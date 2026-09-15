# Audio asset provenance

Review date: 2026-09-15

The manifest of record is `src/data/audio.json`. Detailed source URLs, extraction windows, and hashes for external weapon clips are recorded in [`docs/audio-licenses/dvids-weapon-fire.md`](audio-licenses/dvids-weapon-fire.md).

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

The two bundled music entries are user-provided MP3 files copied without modification after the user confirmed permission to ship them on 2026-09-15.

| ID | Runtime asset | License status | Commercial-use check | Runtime SHA-256 | Attribution |
| --- | --- | --- | --- | --- | --- |
| music.main-menu | `/assets/game/audio/breach_in_the_hull.mp3` | approved | User confirmed distribution permission on 2026-09-15 | `B8C165C78854CA28208812E8708A7C23C12E432BA0872870407F1EEA0C09C10C` | User-provided music |
| music.gameplay.default | `procedural://music-gameplay-default` | approved | Project-authored synthesis | None | No third-party asset |
| music.gameplay.test | `/assets/game/audio/locked_inside_the_shell.mp3` | approved | User confirmed distribution permission on 2026-09-15 | `40582087952FB708EDE96965069DB2CF70F8000C6BEFB0A19AED7F5B35CC142C` | User-provided music |

The remaining entries (`direct-fire`, `arc-fire`, `impact`, `explosion`, `enemy.death`, and `ui.upgrade-confirm`) remain project-authored procedural synthesis with no third-party source file.

`npm run qa:audio` rejects missing, unapproved, unprovenanced, or hash-mismatched entries; bundled music must remain under `/assets/game/audio/`.
