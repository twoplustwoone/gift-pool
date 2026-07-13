# Claude Design prompt template

Design a responsive Gift Pool experience for **[feature or surface]**.

## Product context

[Explain Gift Pool, the relevant group/pool/person context, and why this feature belongs in the product.]

## User and job

- Primary user: [user/role]
- Situation: [entry point and context]
- Job to be done: [one sentence]
- Successful outcome: [terminal state]

## Required experience

[Describe the information hierarchy, primary action, secondary actions, and navigation.]

## Required states

- Default: [state]
- Loading/saving: [state]
- Empty: [state]
- Error: [state]
- Permission/visibility: [state]
- Muted/dismissed/persisted: [state, when relevant]
- Success: [state]

## Responsive behavior

- Mobile: [layout and interaction expectations]
- Desktop: [layout and interaction expectations]
- All modal interactions must be bottom sheets below 640px and centered dialogs on desktop.

## Existing patterns and constraints

[Name reusable components, current screenshots, privacy/secrecy boundaries, accessibility requirements, and product rules.]

## Non-goals

[List behaviors or adjacent features this design must not introduce.]

## Deliverables

Create:

1. Annotated mobile mockups for every required state.
2. Annotated desktop mockups for every required state.
3. Interaction notes covering entry, dismissal, persistence, validation, and success.
4. A short reusable-pattern recommendation identifying what should become a shared component.
5. A list of assumptions or unresolved product questions.

Do not write implementation code. Preserve Gift Pool's established visual language unless the brief explicitly asks for a new pattern.

## Attachments and source material

[List screenshots, route/component files, product specs, and design rules supplied with this prompt.]
