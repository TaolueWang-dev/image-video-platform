# image-video-platform Constitution

> Ralph Wiggum operating rules for this repository.

## Version
1.0.0

---

## Context Detection for AI Agents

### 1. Interactive Mode
When you are not inside a Ralph loop:
- collaborate normally with the user
- help draft or refine specs before execution
- preserve existing repository guidance

### 2. Ralph Loop Mode
When you are running inside `scripts/ralph-loop-codex.sh`:
- work autonomously from disk state
- read the highest-priority incomplete spec in `specs/`
- implement only what the spec requires
- verify acceptance criteria before declaring success
- output `<promise>DONE</promise>` only when the spec is complete
- if git commit or push is unavailable, note that limitation and continue with local completion

How to detect:
If the prompt tells you to read this constitution and pick incomplete work from `specs/`, you are in Ralph Loop Mode.

---

## Core Principles

### I. Repository-First Adaptation
Preserve the repository's existing workflow and conventions. Ralph should fit the project, not force a foreign structure onto it.

### II. Small, Verifiable Specs
Keep specs narrow, concrete, and independently completable.

### III. Simplicity & YAGNI
Build exactly what the spec asks for. Avoid speculative features and unnecessary abstractions.

### IV. File-Based Continuity
Persist progress through files on disk such as specs, logs, and history notes rather than relying on long conversational context.

### V. Focused Exploration
Prefer the smallest relevant file set first. Avoid broad repository dumps unless the spec explicitly requires them.

Repository guidance for this project:
- Start with `src/`, `public/`, `tests/`, `.env.example`, and `README.md`
- Avoid reading `page/`, `SDK/`, image assets, and other large/binary directories unless the active spec requires them
- Prefer targeted `sed`, `rg`, and direct file reads over `find ... | xargs sed` across the whole repo

---

## Ralph Wiggum Configuration

### Autonomy Settings
- **YOLO Mode**: DISABLED
- **Git Autonomy**: CONDITIONAL
  - commit and push only if the repository is a working git checkout with a usable remote

### Work Item Source
- **Source**: Root-level markdown specs
- **Location**: `specs/*.md`
- **Ordering**: Lowest numbered incomplete file wins first
- **Completion marker**: `Status: COMPLETE`

### Ralph Loop Script
- `scripts/ralph-loop-codex.sh`

Usage:
```bash
./scripts/ralph-loop-codex.sh
./scripts/ralph-loop-codex.sh 20
./scripts/ralph-loop-codex.sh plan
```

---

## Validation Commands

Start with:

```bash
bash -n scripts/*.sh scripts/lib/*.sh
./scripts/ralph-loop-codex.sh --help
./scripts/ralph-loop-codex.sh
```

Add stronger checks inside each spec when the project needs them.

Created: 2026-05-08
Version: 1.0.0
