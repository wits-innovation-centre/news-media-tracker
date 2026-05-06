---
description: "Generate Fleet Orchestrator launch prompts for conductor and worker lanes in @cloud format"
name: generate fleet prompts
argument-hint: "Provide planned version, lane list, dependencies, merge policy, and constraints"
agent: "Fleet Orchestrator"
---

Generate launch-ready prompts for a Fleet Orchestrator phase.

Inputs to use from this request:

- Planned version and phase name
- Allowed change class and merge policy
- Phase branch and final merge target
- Conductor lane details
- Worker lane details (lane id, purpose, branch, dependencies, owned surface)
- Stop conditions and verification expectations

Rules:

1. Output only code blocks that can be pasted directly into chat.
2. Every code block must start with @cloud on the first line.
3. Provide one code block per lane, in launch order (conductor first).
4. Include branch, target branch, PR prefix, dependencies, owned surface, required outputs, and stop conditions.
5. Keep prompts strict about scope boundaries and semver contract enforcement.
6. Use canonical lane naming format: [<planned-version>][<agent-id>-<short-name>] <task-description>.
7. If dependencies block a lane, clearly state start condition inside that lane prompt.
8. Do not include explanatory prose between code blocks.
9. Every lane prompt must include a Repository lock directive section before lane identity.
10. Repository lock must include startup gates and PR gates that prevent cross-repo drift.

Repository lock directive (required in every generated lane prompt):

- Hard scope:
  - Repository owner/name: <repo owner>/<repo name>
  - Working directory: /workspace/<repo name>
  - Allowed branches: phase/<planned-version>, lane/<planned-version>/<lane-id>
  - Target branch for worker PRs: <phase branch>
  - Final merge target: <final merge target>
- Forbidden:
  - No branch creation in sibling repositories.
  - No PRs outside the locked repository.
  - No file edits outside /workspace/<repo name>.
- Startup gate (required):
  1.  Print repo remote and active branch for /workspace/<repo name>.
  2.  If repo is not <repo owner>/<repo name>, stop and report blocker.
  3.  If branch target is not phase/<planned-version> or lane/<planned-version>/<lane-id>, stop and report blocker.
  4.  Continue only after all gates pass.
- PR gate (required):
  - PR repository must be <repo owner>/<repo name>.
  - PR base must be <phase branch>.
  - PR title must start with lane prefix.
  - Include verification summary and owned-surface confirmation.
  - If any gate fails, do not open PR.

Output structure:

- Code block 1: conductor prompt
- Code blocks 2..N: worker prompts in dependency-safe order

Template shape to follow for each lane:

```text
@cloud You are <lane name>.

Repository lock directive:
- Hard scope:
	- Repository owner/name: <repo owner>/<repo name>
	- Working directory: /workspace/<repo name>
	- Allowed branches: phase/<planned-version>, lane/<planned-version>/<lane-id>
	- Target branch for worker PRs: <phase branch>
	- Final merge target: <final merge target>
- Forbidden:
	- No branch creation in sibling repositories.
	- No PRs outside the locked repository.
	- No file edits outside /workspace/<repo name>.
- Startup gate:
	1. Print repo remote and active branch for /workspace/<repo name>.
	2. Stop if repo or branch target does not match contract.
	3. Continue only after all gates pass.
- PR gate:
	- PR repository must match lock.
	- PR base must be <phase branch>.
	- PR title must start with <lane prefix>.
	- Include verification summary and owned-surface confirmation.

Lane identity:
- Branch: <lane branch>
- Target branch: <phase branch>
- PR title prefix: <lane prefix>

Fleet contract:
- Planned version: <planned version>
- Allowed change class: <change class>
- Merge policy: <merge policy>
- Dependency: <if applicable>

Task:
- <task bullets>

Owned surface:
- <owned surface bullets>

Required outputs:
- One PR to <phase branch>
- Verification summary: <tests/lint/behavior checks>
- Manifest status updates: readiness, blockers, PR metadata

Stop conditions:
- <stop condition bullets>
```

Now generate the launch prompts for this specific fleet request using the supplied arguments and constraints.
