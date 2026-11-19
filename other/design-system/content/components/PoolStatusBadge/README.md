# PoolStatusBadge

The one pool-stage indicator, mapping internal statuses to the user-facing stage names.

**Props:** `status` (`OPEN | VOTING | DECIDED | PURCHASED | DELIVERED | CANCELLED`) and `className`. The label always shows: Collect ideas (teal: coordination underway), Choose the gift and Deliver it (amber: waiting on people), Buy the gift (green: decision made), Complete (muted: historical), Cancelled (muted, struck through).

- Never recolor a stage locally or invent a stage name. Change the mapping here.
- Admin and calm-operations views may show the internal status words. Consumer surfaces use these stage names.
- Known gap: "Buy the gift" in light is 4.18:1, a little under 4.5:1.

Source: `app/components/pools/pool-status-badge.tsx` in twoplustwoone/gift-pool, bundled as is.
