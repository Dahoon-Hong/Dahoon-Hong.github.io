# Audio licensing policy

The Plan 21 effects and the existing default gameplay loop are project-authored procedural sounds generated at runtime with the browser Web Audio API. The main-menu and canonical test-map tracks are user-provided MP3 assets; the user confirmed permission to ship them in this project on 2026-09-15. No unapproved recording, sample, voice, AI-generated music, or ChatGPT Voice output is shipped.

The release gate is fail-closed:

- Every shipped sound must appear in src/data/audio.json.
- Only entries with licenseStatus: approved and either a procedural:// source or a bundled `/assets/game/audio/` source may be used by the runtime.
- Bundled user-provided assets require a per-file provenance record, a stable internal source record, the file hash, permission confirmation, and a commercial-use review before they can be added.
- CC0 is the default acceptable external license. CC BY is allowed only when attribution text and the exact source record are committed. NC, ND, Sampling+, unknown, preview-only, or unclear terms are rejected.
- ChatGPT Voice output is not used as a distributable game sound. API-generated audio would require a separate rights and provenance review before shipping.

Reference material used for the policy:

- Creative Commons CC0: https://creativecommons.org/publicdomain/zero/1.0/
- Creative Commons Attribution 4.0: https://creativecommons.org/licenses/by/4.0/
- Freesound license FAQ: https://freesound.org/help/faq/
- OpenGameArt FAQ: https://opengameart.org/node/5571
- OpenAI text-to-speech guide: https://developers.openai.com/api/docs/guides/text-to-speech
- OpenAI Service Terms: https://openai.com/policies/service-terms/

This policy documents the project decision and is not a substitute for jurisdiction-specific legal advice.
