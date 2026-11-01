# Project C branch instructions

This parentless branch contains the standalone Project C Unity game. Do not use
the existing defence2 game implementation or its implementation plans as a
requirements or design source.

## Working sources

1. [Project C documentation guide](ProjectC/Documentation/README.md)
2. [Q-494 source index](ProjectC/Documentation/Notion-Q-494/INDEX.md)
3. [Development handoff](ProjectC/Documentation/Notion-Q-494/source/development-handoff.md)
4. [Current planning source](ProjectC/Documentation/Notion-Q-494/source/planning.md)
5. [Project C MVP Plan 1](plans/implementation/1-project-c-mvp/1-project-c-mvp.md)

Use the branch-local snapshot for requirements and update it when requirements
change. Preserve the source Markdown, JSON records, and wireframe PNG. The wireframe
is a layout reference; its example values and visual styling are not confirmed
requirements.

## Implementation boundary

- Keep game rules in a screenless C# simulation core, separate from Unity
  presentation, input, audio, and Windows integration.
- Plan 1 is the only implementation plan in this fresh branch. Its requirements,
  scope, acceptance criteria, and required runtime scenarios govern the MVP.
- Do not describe planned work as implemented, tested, built, or played without
  evidence from this branch.
