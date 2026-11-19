# StatusButton

A Button that shows a mutation's progress inline, so the person keeps their context while it saves.

**Props:** everything Button takes, plus `status` (`idle | pending | success | error`), an optional `message` shown in a tooltip on the status icon, and `spinDelay` (the spinner appears after 400ms and stays at least 300ms, so fast saves never flash).

- Pair with a pending label: "Saving…", "Choosing…".
- Disable re-submission while `pending`.
- Known gap: on the default terracotta fill, the green check and red cross icons have little contrast. Put the outcome in text too.

Source: `app/components/ui/status-button.tsx` in twoplustwoone/gift-pool, bundled as is.
