---
name: prepare-ui-design-handoff
description: Prepare a product and interaction brief for Claude Design before implementing a net-new user-facing surface, interaction pattern, or substantial layout and hierarchy change in Gift Pool. Use when a UI request needs discovery questions, responsive state coverage, a copy-paste design prompt, or an audit of returned mockups. Do not use for small copy changes or faithful extensions of an established pattern.
---

# Prepare UI Design Handoff

Turn an unresolved UI request into an implementation-ready design handoff. Keep this phase read-only unless the user separately asks to save a design brief or update a local plan.

## Workflow

1. Decide whether the work is a design checkpoint.
   - Treat a new surface, new interaction pattern, or material hierarchy change as a checkpoint.
   - Treat a small change that follows an accepted existing pattern as implementation work.
   - Explain the classification briefly. If it is a checkpoint, ask whether the user wants Claude Design first unless they already requested it or supplied an accepted mock.
2. Inspect the current product before asking questions.
   - Read the relevant route, components, tests, product documents, and `AGENTS.md` rules.
   - Identify reusable primitives and binding constraints, including mobile bottom sheets, secrecy boundaries, permissions, loading/error/empty states, and accessibility.
   - Do not change production code during discovery.
3. Resolve the design inputs.
   - Ask one to three focused questions per round.
   - Establish the user and job, entry point, primary action, information hierarchy, responsive behavior, required states, persistence/dismissal semantics, accessibility, and non-goals.
   - Make low-risk recommendations instead of asking the user to decide every detail.
4. Build the handoff.
   - Use [claude-design-prompt.md](assets/claude-design-prompt.md) as the output structure.
   - Replace every bracketed placeholder; omit irrelevant sections.
   - Include an attachment checklist naming screenshots, source files, and product documents Claude Design should receive.
   - Ask for annotated mobile and desktop mockups and state/interaction notes, not implementation code.
5. Pause at the design boundary.
   - Give the user one copy-paste prompt.
   - Do not implement the checkpoint UI until the user returns with a mock or explicitly opts out of design-first work.
6. Audit the returned design.
   - Compare it with the agreed brief, existing primitives, responsive rules, permissions, privacy, content states, and accessibility.
   - Separate binding corrections from optional refinements.
   - Record accepted decisions and binding deltas in the matching local plan before implementation.
7. Hand off to implementation.
   - Translate the accepted design into component boundaries, server/data needs, analytics, tests, screenshots, and an atomic PR sequence.
   - Preserve the accepted hierarchy; do not quietly redesign while coding.

## Output

Return:

1. Resolved decisions and remaining assumptions.
2. The copy-paste Claude Design prompt.
3. The attachment checklist.
4. The condition that must be met before implementation begins.
