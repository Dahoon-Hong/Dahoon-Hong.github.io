# Audio licensing policy

The game ships project-authored Web Audio synthesis for non-weapon effects and approved public-domain DVIDS clips for weapon firing effects. No CC BY, including CC BY 4.0, is used for the shipped weapon sounds.

The release gate is fail-closed:

- Every shipped sound must appear in `src/data/audio.json`.
- Procedural entries must use `procedural://` and the project-authored license record.
- External entries must use a `/assets/` path, include a stable source URL, the exact public-domain/license review URL, original and runtime SHA-256 hashes, extraction timing, and a modification summary.
- Only project-authored, CC0, or clearly public-domain assets are acceptable. CC BY, NC, ND, Sampling+, unknown, preview-only, or unclear terms are rejected for this project.
- DVIDS assets are accepted only when the source page marks the media `PUBLIC DOMAIN` and the record retains the DVIDS copyright restrictions page.
- ChatGPT Voice output is not used as a distributable game sound.

The manifest is the source of record. `npm run qa:audio` verifies the manifest, approved license category, asset existence, and runtime SHA-256 values.

Reference material:

- [Creative Commons CC0](https://creativecommons.org/publicdomain/zero/1.0/)
- [DVIDS copyright and restrictions](https://www.dvidshub.net/about/copyright)
- [OpenGameArt FAQ](https://opengameart.org/node/5571)

This policy documents the project decision and is not a substitute for jurisdiction-specific legal advice.
