# Ralph Wiggum Quickstart

This project has a local Ralph Wiggum setup adapted for Codex.

## Files

- Constitution: `.specify/memory/constitution.md`
- Loop: `scripts/ralph-loop-codex.sh`
- Spec template: `templates/spec-template.md`

## Spec Format

Use root-level numbered markdown files:

```text
specs/001-some-task.md
specs/002-another-task.md
```

A spec is complete only when it contains:

```text
Status: COMPLETE
```

## First Run

1. Copy `templates/spec-template.md` to a numbered file in `specs/`
2. Fill in requirements, checklist, and validation commands
3. Run `./scripts/ralph-loop-codex.sh`

Optional planning mode:

```bash
./scripts/ralph-loop-codex.sh plan
```
