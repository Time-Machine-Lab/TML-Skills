---
name: spec-governed-coding
description: Run coding tasks through a governed spec-first workflow that combines spec-kit artifacts, atomic subagent execution, and lightweight delivery governance. Use when the user says to complete a coding task with this skill and expects Codex to automatically discover the current spec stage, workspace governance files, and next execution route; when a coding task should be driven by `spec.md`, `plan.md`, and `tasks.md`; or when a team wants repeatable delivery with shared governance files and task-level run logs instead of ad hoc routing decisions.
---

# Spec Governed Coding

## Overview

Use this as the top-level skill for coding delivery. It combines:

- spec-kit for task-definition artifacts
- embedded companion skills for routing, execution, review, and closeout
- lightweight governance files for repeatable execution and post-task reflection

This skill does not replace spec-kit or its companion execution skills. It wraps them in a stable delivery model that can be reused across coding tasks.

Default expectation: a user should be able to say `use /spec-governed-coding to complete this task` and let the skill discover the current state instead of dictating the whole protocol by hand.

When delegation is appropriate, use the workspace executor catalog at `docs/governance/executor-profile-catalog.md` as the default library for choosing the narrowest matching executor profile.

## Delegation Posture

Default stance after `tasks.md` exists:

- master is a router, approver, and synthesizer first
- master execution is the exception path, not the default path
- evidence work and production work should be delegated first when they can be expressed as single-owner atomic slices

Do not ask only "can the master do this well enough?"

Ask first:

1. should the master be doing this at all
2. can this step be expressed as one atomic delegated slice
3. if staying local, what specific risk or distortion makes delegation uneconomical right now

The burden of proof is on local execution once the artifact chain is stable enough for execution.

## Work Classification

Before deciding who should do the next step, classify the work into one of these types:

### Evidence Work

Use for work whose main output is evidence rather than code changes.

Examples:

- readiness checks
- integration checks
- test execution
- environment or config verification
- codebase mapping and signal collection

Default bias:

- prefer delegation when the evidence can be produced as an atomic slice
- keep only the final synthesis and tradeoff judgment with the master

### Production Work

Use for work whose main output is a concrete system change.

Examples:

- implementation slices
- targeted test additions
- migration updates
- repair patches

Default bias:

- define an atomic slice first
- delegate the slice once boundaries and acceptance checks are clear

### Judgment Work

Use for work whose main output is a decision, prioritization, or final synthesis across multiple evidence sources.

Examples:

- choosing the next route
- deciding whether a chain is ready enough
- deciding whether to write a run log
- deciding whether a result should be accepted

Default bias:

- keep with the master unless the judgment can be reduced to evidence collection plus a later synthesis step

## Default Startup Behavior

On activation, do this automatically:

1. Self-check embedded dependencies.
   Verify the companion skills listed in `manifest.json` are available in the searchable skill namespace.
   If any are missing or incomplete, run:
   `python <installed-skill-root>/scripts/self_check_install.py`
   using the copies in `<installed-skill-root>/skill-dependencies/`.
2. Identify the active workspace or repo.
3. Discover the current task-definition artifact chain.
   Search for the most relevant `spec.md`, `plan.md`, and `tasks.md` near the active work area before asking the user to restate status.
4. Discover the governance baseline.
   Look for standing governance files under `docs/governance/`.
5. If the governance baseline is missing, bootstrap it automatically from this skill's templates.
   Run:
   `python3 <installed-skill-root>/scripts/bootstrap_governance_baseline.py --workspace <workspace-root>`
   Then verify the workspace now has:
   - `docs/governance/delivery-constitution.md`
   - `docs/governance/delivery-protocol.md`
   - `docs/governance/executor-profile-catalog.md`
   - `docs/governance/run-log-template.md`
   Treat this as workspace setup, not as a governance gap.
6. Classify the current stage.
   Decide whether the task is still in definition, planning, execution, review, or closeout.
7. Choose the next route.
   If artifacts are incomplete, repair the missing layer.
   If execution is ready, route through `spec-subagent-orchestrator`.
8. Explain only the essential next step.
   Do not require the user to restate slice, logging, or delegation policy unless the workspace is genuinely ambiguous.

Read [state-discovery.md](references/state-discovery.md) when the current stage or workspace layout is unclear.

## What This Skill Governs

Separate two layers:

### 1. Task-definition artifacts

These define the work itself:

- `spec.md`
- `plan.md`
- `tasks.md`

### 2. Delivery-governance artifacts

These define how the work should be delivered:

- `docs/governance/delivery-constitution.md`
- `docs/governance/delivery-protocol.md`
- `docs/governance/run-log-template.md`
- `docs/governance/runs/YYYY-MM-DD-<task>.md`

Read [governance-layout.md](references/governance-layout.md) when the workspace layout is missing or unclear.
Read [bootstrap-baseline.md](references/bootstrap-baseline.md) when governance files are missing in the current workspace.

## Operating Model

Follow this order:

1. Confirm the task-definition artifact chain.
   If `spec.md`, `plan.md`, or `tasks.md` is missing or unstable, repair that first.
2. Confirm the governance baseline.
   Use the workspace governance files as the standing delivery rules. Do not rewrite them per task.
3. Route the next step through `spec-subagent-orchestrator`.
4. Prefer subagents for most execution work after `tasks.md` exists.
   Keep master work focused on routing, slice definition, gate decisions, and synthesis.
   When delegating, pick the executor profile from the workspace catalog before drafting the slice brief.
   In particular, treat evidence-producing work as delegation-friendly whenever it can be split cleanly.
   Do not let "the master could do it" become the reason to keep it local.
5. Close the task with a task-level run log when the task is substantial enough to validate the workflow.

## Workspace Discovery Rules

Prefer discovery over clarification when local context can answer the question.

- Check the active directory first.
- Then check nearby task folders or specs folders.
- Prefer the most recently active artifact chain that clearly matches the user's request.
- If multiple valid chains exist, present the best candidate and one short ambiguity note instead of dumping every option.
- Only ask the user to choose when the ambiguity would materially change execution.

Read [governance-layout.md](references/governance-layout.md) if governance files are missing or scattered.

## Default Responsibilities

### Master

The master should primarily:

- align with the user
- inspect the artifact chain
- define or approve atomic slices
- dispatch subagents
- enforce review and verification gates
- synthesize the final answer

The master should not default to being the hands-on executor once the next step can be delegated as a clean atomic slice.

### Subagents

Subagents should primarily:

- scope broad work into atomic slices
- execute atomic slices
- review targeted slices
- repair failed gates
- help integrate accepted slices

Do not hand a subagent a vague multi-goal work package if it can be sliced more cheaply.

## When To Create or Update Governance Files

Treat governance files as long-lived workspace files, not per-task documents.

- Create or bootstrap them once per workspace or repo when the governed workflow is first adopted.
- Update them only when a real task exposes a weakness in the delivery model and a human explicitly chooses to revise them.
- Do not rewrite them for normal feature work.

The only file that should usually change per task is a task-level run log instance.

If the governance baseline is missing in a workspace that intends to reuse this workflow, create it automatically from the templates in `references/templates/` before repeated governed delivery begins.
Prefer the bootstrap helper script in `scripts/bootstrap_governance_baseline.py` instead of manually copying files one by one.

## When To Update This Skill

Treat changes to this skill as evidence-driven maintenance, not ad hoc rewriting.

When this skill is updated, append a short entry to:

- `SKILL-CHANGE-LOG.md`

Each entry should name:

- source run logs
- observed pattern
- skill change

Do not change the skill without tying the change back to one or more real run logs, unless the change is a pure typo fix or tool-path correction.

## When To Write a Run Log

Do not write a run log for every tiny task.

Write one when:

- validating this workflow on a real coding task
- a task was large enough to involve meaningful routing or delegation
- the task exposed waste, rework, or governance gaps worth recording

Read [run-log-policy.md](references/run-log-policy.md) when deciding whether a task merits a run log.

Default behavior:

- Reuse the standing governance files automatically.
- Create a task-level run log only when the task meets the policy threshold.
- If a run log is warranted, store it under `docs/governance/runs/`.
- Treat the run log as data for later human review, not as authority to mutate governance files automatically.

## Quality and Cost Model

Do not pretend to know exact token spend.

Use practical delivery cost instead:

- master-side analysis load
- repeated file reading without new output
- context pressure and precision loss
- vague delegation and rework
- unnecessary coordination overhead

The goal is simple:

Deliver a verified, high-quality result at the lowest practical cost.

## How This Skill Uses Other Skills

- Use spec-kit commands or artifacts to define the work.
- Self-check and install embedded companion skills from `skill-dependencies/` before routing.
- Use `spec-subagent-orchestrator` to choose the next execution mode and define atomic slices.
- Use `docs/governance/executor-profile-catalog.md` to choose the narrowest matching executor profile for any delegated slice.
- Use companion skills only after routing says they are the right fit.

## Packaging Notes

This published version is designed to travel as one self-contained entry skill.

- Keep this directory together with its `scripts/`, `references/`, and `agents/` subdirectories.
- Keep `skill-dependencies/` inside this directory so the self-check installer can repair missing companion skills.
- Do not publish the companion skills as peer directories in the TML top-level `skills/` catalog.
- Resolve `<installed-skill-root>` to the directory that contains this `SKILL.md`.
- Do not rewrite the workflow for a target IDE; only adapt installation paths and invocation syntax as needed.

When in doubt, ask first:

1. is this evidence work, production work, or judgment work?
2. if it is evidence or production work, can it be delegated as an atomic slice?
3. if staying local anyway, what concrete delegation blocker justifies that exception?

## Observability Requirement

Do not keep governance reasoning implicit.

At each meaningful execution turn, emit short observable decisions so the user can tell whether delegation and governance were used intentionally or ignored by habit.

### Dispatch Decision

Always state, in a stable checklist-like shape:

- current stage
- work classification: evidence / production / judgment
- whether this turn delegates or stays local
- delegation blocker: required whenever staying local; use `none` only when delegating
- why that choice is economical right now
- if staying local, the explicit blocker that prevents safe delegation right now
- what condition would trigger delegation if staying local
- the next candidate atomic slice even if staying local
- the candidate executor profile for that slice even if staying local
- what atomic slice is next if delegating
- which executor profile was chosen if delegating

Do not leave delegation hypothetical. If staying local, still name the first slice you would delegate next and the executor profile you would use.

Weak reasons for staying local do not count. Avoid generic explanations such as:

- "it is faster if I do it myself"
- "the change is concentrated in one area"
- "I already have the context"

These only justify staying local if tied to a concrete delegation failure mode such as unresolved ownership, unstable contract boundaries, or a judgment-heavy decision that is itself the work.

`delegation blocker` should be a short noun phrase, not a paragraph. Good examples:

- `unstable contract boundary between runtime resolver and registry model`
- `judgment-heavy prioritization is the work`
- `write ownership not yet separable without overlap`

Bad examples:

- `I can do this faster myself`
- `I already read the files`
- `this seems easier locally`

Candidate and chosen executor profiles should come from `docs/governance/executor-profile-catalog.md` by default.

If no catalog entry fits, say that explicitly and explain the gap instead of inventing a casual new profile name.

## Dispatch Commitment

Treat each stated candidate slice and candidate executor profile as a soft commitment.

If a later turn delegates, do one of these:

- use the previously stated candidate slice and candidate executor profile
- explicitly state why the commitment changed before delegating differently

Do not silently switch to a different slice or a different executor profile after naming a prior candidate.

### Governance Decision

Always state:

- whether the standing governance files are simply being reused
- whether the workspace baseline was auto-bootstrapped this turn
- whether the task appears significant enough for a run log
- whether the task exposed a governance gap worth noting for later human review

### Closeout Reflection

At task closeout or major checkpoint, state:

- what the master carried
- what was delegated
- what part of the run was most expensive
- whether the governed workflow felt worth reusing on a similar task

## Outputs

When this skill is active, produce:

1. Current artifact state
   What exists in the task-definition chain and governance layer.
2. Delivery route
   What the master will do next and what will be delegated.
3. Governance impact
   Whether the task should reuse the standing protocol unchanged or create a run-log instance.
4. Next concrete action
   The exact next slice, check, or dispatch.
5. Discovery result
   Which workspace, artifact chain, and governance baseline were selected automatically.
6. Dispatch decision
   The explicit delegate-or-stay-local judgment for this turn.
   Include `delegation blocker`.
7. Governance decision
   Whether governance is reused or auto-bootstrapped, whether a run log is warranted, and whether a gap was observed.

At closeout, also include a short `Closeout Reflection`.
