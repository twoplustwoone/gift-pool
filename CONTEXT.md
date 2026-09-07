# Domain context

## Gift coordination

**Group**
: A persistent set of people who coordinate gifts for one another across recurring occasions.

_Avoid:_ “Circle” as a functional label for the object; use it only as conversational prose about close relationships.

**Friend**
: A user connected to another user through a mutually accepted direct friendship.

_Avoid:_ Calling a shared Group member a Friend unless the direct friendship also exists.

**Person Note**
: A private observation one user records about another person for future gift planning, visible only to its author.

_Avoid:_ Presenting Person Notes as shared group or pool memory.

**Pool**
: A private, occasion-specific effort in which contributors coordinate one gift for a recipient who cannot access the plan.

_Avoid:_ Fund, campaign, collection, or language implying that Gift Pool holds money.

**Pool Stage**
: The current coordination phase of a Pool: Collect ideas, Choose the gift, Buy the gift, Deliver it, or Complete.

_Avoid:_ Treating contributor membership such as “Joined” as a Pool Stage, or using “Celebrate” to conceal purchase and delivery work.

**Contribution Limit**
: The private maximum amount a contributor is comfortable covering for a Pool, visible only to that contributor.

_Avoid:_ Pledge, payment, amount collected, configurable peer visibility, or language implying that Gift Pool moves money.

**Available Budget**
: The shared collective capacity of a Pool, derived from the current contributors’ private Contribution Limits.

_Avoid:_ Treating it as an independently editable fundraising goal or amount collected.

**Gift Price**
: The estimated or final cost of a proposed or chosen gift.

_Avoid:_ Calling the Gift Price the Pool’s goal or Available Budget.

**Contribution Share**
: The calculated portion of the Final Price that a contributor owes directly to the purchaser.

_Avoid:_ Contribution Limit, payment processed by Gift Pool, charge, or transfer. The UI may shorten this to “your share” when the Pool context is clear.

**Received**
: The purchaser-confirmed state that a contributor’s Contribution Share was received outside Gift Pool.

_Avoid:_ Letting contributors self-confirm payment or implying that Gift Pool verified the transfer.

**Occasion Decline**
: A private, undoable choice to sit out one specific occurrence of another person’s occasion.

_Avoid:_ Group-visible participation status, permanent opt-out, or a general notification mute.

**Gift Memory**
: A durable record of what was given for a person and occasion, visible only to the people who participated in that gift intent.

_Avoid:_ Social photo album, shallow activity log, or unverified claims about how the recipient felt.

**Exchange**
: A closed-loop gift draw in which every participant is assigned exactly one other participant to give to, in secret, for one occasion. "Gift exchange" on first mention in a surface; "Exchange" once the page has established itself.

_Avoid:_ "Secret Santa" outside setup and empty states; treating an Exchange as a kind of Pool (a Pool is many-to-one, an Exchange is a closed loop of one-to-one); "raffle" or "swap".

**Draw**
: The organizer's irreversible act that turns the roster into one closed loop of assignments. "The draw" for the event, "drew" for an assignment ("you drew Sam").

_Avoid:_ "Drawing" as a noun; "re-draw" (an Exchange is cancelled and started again instead).

**Exclusion**
: A symmetric "don't pair these people" rule an organizer sets before the Draw.

_Avoid:_ "Block", or any wording that implies one direction.

**Gifter / Giftee**
: The two roles in one assignment. "Your person" is the section label for your giftee on the exchange page only; elsewhere use the name or "who you drew". "Who has you" is the question form; "your gifter" is the post-reveal name for the role.

_Avoid:_ "Santa", "target", "your person's wishlist".

**Reveal**
: The moment the whole loop becomes visible to every participant at once, pressed by the organizer or performed by Gift Pool at the auto-reveal time. A "secret forever" Exchange never reveals; it finishes.

_Avoid:_ "Unmask"; letting an organizer see any pairing before the Reveal.

**Exchange Note**
: A preset, two-way message between a gifter and their giftee, delivered in a morning batch. Not yet built (Phase B).

_Avoid:_ Confusing it with a Person Note, which is author-private and never delivered.

## Notifications

**Notification Event**
: A concrete domain occurrence that may produce delivery, such as a vote
starting or a purchaser being assigned.

_Avoid:_ Using “notification type” for both an occurrence and a user-facing
preference.

**Notification Topic**
: A stable user-facing preference unit that groups related Notification Events.

_Avoid:_ Creating a new user setting for every concrete event.

**Notification Category**
: A high-level grouping of Notification Topics used for bulk preference changes.

_Avoid:_ Treating a category as a concrete event.

**Delivery Channel**
: A medium through which a notification can be delivered: in-app, email, or web
push.

_Avoid:_ Calling a device subscription a preference; it is channel capability.

**Notification Context**
: A group or pool whose activity setting can further filter an eligible
Notification Event.

_Avoid:_ Treating a context preference as permission to re-enable a globally
disabled topic or channel.

**Activity Level**
: The amount of contextual activity a user wants: All activity, Important only,
Muted, or Custom.

_Avoid:_ Calling an Activity Level a Delivery Channel preference.

**Effective Notification Policy**
: The resolved, explainable per-channel decision after defaults, user overrides,
and context settings are applied.

_Avoid:_ Calling a stored preference row or device capability the effective
policy.

**Activity Update**
: An automatic notification caused by a domain event and containing no
user-authored body.

_Avoid:_ Calling automatic activity a message or nudge.

**Organizer Nudge**
: A preset, task-bound request that a Pool Manager sends to eligible pool
contributors.

_Avoid:_ “Message,” “broadcast,” or any term that implies free-form content.

**Message**
: Persisted user-authored conversation content.

_Avoid:_ Treating a notification or Organizer Nudge as a Message.

## Pools

**Pool Manager**
: A user who can manage a pool: its organizer or an owner/admin of its parent
group.

_Avoid:_ “Pool owner”; Gift Pool has pool organizers and group owners, and the
terms represent different roles.
