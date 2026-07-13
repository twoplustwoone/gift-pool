# Domain context

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
