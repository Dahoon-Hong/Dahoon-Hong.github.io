# Audio asset provenance

Review date: 2026-09-06

Plan 21 effects and the default gameplay loop are generated locally at runtime. The two additional music entries are user-provided MP3 files copied without modification after the user confirmed permission to ship them on 2026-09-15.

| ID | Source | License status | Commercial-use check | Runtime SHA-256 | Attribution |
| --- | --- | --- | --- | --- | --- |
| sfx.weapon.direct-fire | procedural://direct-fire | approved | Project-authored synthesis | None |
| sfx.weapon.arc-fire | procedural://arc-fire | approved | Project-authored synthesis | None |
| sfx.weapon.impact | procedural://impact | approved | Project-authored synthesis | None |
| sfx.weapon.explosion | procedural://explosion | approved | Project-authored synthesis | None |
| sfx.enemy.death | procedural://enemy-death | approved | Project-authored synthesis | None |
| sfx.ui.upgrade-confirm | procedural://upgrade-confirm | approved | Project-authored synthesis | None |
| music.main-menu | /assets/game/audio/breach_in_the_hull.mp3 | approved | User confirmed distribution permission on 2026-09-15 | B8C165C78854CA28208812E8708A7C23C12E432BA0872870407F1EEA0C09C10C | User-provided music |
| music.gameplay.default | procedural://music-gameplay-default | approved | Project-authored synthesis | None | None |
| music.gameplay.test | /assets/game/audio/locked_inside_the_shell.mp3 | approved | User confirmed distribution permission on 2026-09-15 | 40582087952FB708EDE96965069DB2CF70F8000C6BEFB0A19AED7F5B35CC142C | User-provided music |

The manifest of record is src/data/audio.json. The runtime and `npm run qa:audio` reject missing, unapproved, or unsupported entries; bundled music must remain under `/assets/game/audio/`.
