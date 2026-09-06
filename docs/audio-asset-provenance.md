# Audio asset provenance

Review date: 2026-09-06

All Plan 21 entries are generated locally at runtime. Therefore there is no downloaded source file, no third-party attribution, and no source-file hash to preserve.

| ID | Source | License status | Commercial-use check | Attribution |
| --- | --- | --- | --- | --- |
| sfx.weapon.direct-fire | procedural://direct-fire | approved | Project-authored synthesis | None |
| sfx.weapon.arc-fire | procedural://arc-fire | approved | Project-authored synthesis | None |
| sfx.weapon.impact | procedural://impact | approved | Project-authored synthesis | None |
| sfx.weapon.explosion | procedural://explosion | approved | Project-authored synthesis | None |
| sfx.enemy.death | procedural://enemy-death | approved | Project-authored synthesis | None |
| sfx.ui.upgrade-confirm | procedural://upgrade-confirm | approved | Project-authored synthesis | None |
| music.gameplay.default | procedural://music-gameplay-default | approved | Project-authored synthesis | None |

The manifest of record is src/data/audio.json. The runtime and npm run qa:audio both reject missing, unapproved, or non-procedural entries.
