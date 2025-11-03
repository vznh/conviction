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
    `,
    MARKETPLACE: `# 🏬\n\n
Below are buttons to create any role you'd like.\n
All roles are visible to everyone and anyone can claim it. If you'd like to create a private goal, it's unsupported for now.\n
**Create a role** provides a modal for you to submit a role, given that none of the fields have been taken already.\n
A good standard for creating roles is making them shorthand, and making your description concise but holistic.
### Example\n
My overall goal is to submit any piece of valid work, side project or professionally related.\n
My role name would be 'anywork', and my description would be 'Submit any evidence of programming work.'\n\n
**Delete a role** fetches all roles that you've created and you can select which one to delete. This will delete the role for all users that have this claimed.\n
**Select a role** will prompt you to check all roles that you would like to use.
`,
  },

  GRAB: {
    NONE: '**ERROR**: There were no hard 75 entries found for you.'
  },

  EXISTENT: {
    ENTRY: '**ERROR**: You already have an entry for today.'
  }
} as const;
