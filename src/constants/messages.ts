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
} as const;
