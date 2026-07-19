# Keep contribution limits private by design

Gift Pool keeps each contributor's Contribution Limit visible only to that contributor rather than offering configurable peer or manager visibility. Contributors share the derived Available Budget, managers may see whether a limit is missing, and calculated responsibilities are disclosed only when needed to coordinate payment to the purchaser; this preserves enough information to choose and buy a gift without turning personal financial comfort into a source of comparison or pressure.

## Consequences

The existing budget-visibility settings and stored overrides should be retired through an explicit migration. Removing them simplifies the settings experience, but implementation must preserve the distinction between a private limit, a shared aggregate, and the later amount owed to the purchaser. After purchase, each contributor sees only their own amount and status while the purchaser sees the amounts and statuses owed to them; peers and non-purchasing managers do not.
