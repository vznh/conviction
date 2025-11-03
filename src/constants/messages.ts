export const MESSAGES = {
  ERRORS: {
    NO_TOKEN: 'DEV: Discord token is required but not found.',

    CONNECTION_FAILED: 'DEV: Failed to connect to Discord API.',

    NO_STATUS_CHANNEL: 'DEV: Channel ID is not configured.',

    GENERIC: 'DEV: An error occurred.',

    STATUS_UPDATE_FAILURE: 'DEV: Status update did not successfully run.',
  },

  LOGS: {
    INITIALIZING: 'DEV: Initializing bot.',

    CONNECTED: 'DEV: Successfully connected to Discord.',

    SHUTDOWN_INITIATED: 'DEV: Gracefully shutting down.',

    SHUTDOWN_COMPLETE: 'DEV: Shutdown finalized.',

    LOADING_EVENTS: 'DEV: Loading event handlers.',
  },

  ACTIONS: {
    INIT: `# 🏗️\n\n
Below are buttons to start your entry.\n
**Create an entry** provides a private thread for you to submit items throughout your day.
**View previous entries** provides a DM for you to review any previous entries you had completed before.
    `
  },

  GRAB: {
    NONE: '**ERROR**: There were no hard 75 entries found for you.'
  },

  EXISTENT: {
    ENTRY: '**ERROR**: You already have an entry for today.'
  }
} as const;
