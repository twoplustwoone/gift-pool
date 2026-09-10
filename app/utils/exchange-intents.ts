// Form intents shared by the exchange components (which post them) and the
// exchange route action (which switches on them). Client-safe.
export const EXCHANGE_INTENT = {
  OptIn: 'opt-in',
  OptOut: 'opt-out',
  AddExclusion: 'add-exclusion',
  RemoveExclusion: 'remove-exclusion',
  DrawNames: 'draw-names',
  SetGiftStage: 'set-gift-stage',
  SetReceived: 'set-received',
  SetGiftLabel: 'set-gift-label',
  MarkAssignmentViewed: 'mark-assignment-viewed',
  Reveal: 'reveal',
  Cancel: 'cancel-exchange',
  UpdateSettings: 'update-settings',
  DismissJoinPrompt: 'dismiss-join-prompt',
  SendNote: 'send-note',
  SendClue: 'send-clue',
  SetGuess: 'set-guess',
  SendThanks: 'send-thanks',
} as const;

export type ExchangeIntent =
  (typeof EXCHANGE_INTENT)[keyof typeof EXCHANGE_INTENT];
