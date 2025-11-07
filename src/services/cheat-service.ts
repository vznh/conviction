import {
  Client,
  Interaction,
  SlashCommandBuilder,
  MessageFlags,
  ChannelType
} from "discord.js";
import { logger } from "@/lib/logger";
import { discord_client } from "@/lib/client";
import { Tracker } from "@/bot/statuses";

interface Data {
  username: string;
  available: 0 | 1 | 2 | 3;
}

interface Options {
  client: Client;
  cheat_day_ref_channel_id: string;
  cheat_day_ref_message_id?: string;
}

interface Structure {
  setup(): Promise<void>;
  use_cheat_day(username: string): Promise<boolean>;
  get_cheat_days(username: string): Promise<number>;
  get_command_definition(): SlashCommandBuilder;
  handle_interaction(interaction: Interaction): Promise<void>;
}

class CheatService implements Structure {
  public client!: Client;
  public cheat_day_ref_channel_id!: string;
  public cheat_day_ref_message_id?: string;

  private cheat_days: Map<string, Data> = new Map();

  constructor(options: Options) {
    if (
      !options ||
      !options.client ||
      !options.cheat_day_ref_channel_id
    ) {
      logger.error("DEV: CheatService was not instantiated correctly");
    }
    Object.assign(this, options);
  }

  async setup(): Promise<void> {
    logger.info("DEV: Setting up cheating service.");
    await this._load_cheat_days();
    await this._update_ref_message();
    logger.info("DEV: Set-up cheating service.");
  }

  async use_cheat_day(username: string): Promise<boolean> {
    const data = this.cheat_days.get(username);
    if (!data || data.available <= 0) return false;

    data.available--;
    this.cheat_days.set(username, data);
    await this._update_ref_message();

    logger.warn(`${username} used a cheat day.\n${data.available} remaining.`);
    return true;
  }

  async get_cheat_days(username: string): Promise<number> {
    const data = this.cheat_days.get(username);
    return data ? data.available : 3;
  }

  get_command_definition(): SlashCommandBuilder {
    return new SlashCommandBuilder()
      .setName('cheat')
      .setDescription('Manage your cheat days.')
      .addSubcommand(sub =>
        sub
          .setName('use')
          .setDescription('Use a cheat day to complete today\'s entry.')
      )
      .addSubcommand(sub =>
        sub
          .setName('status')
          .setDescription('Check how many cheat days you have available.')
      ) as SlashCommandBuilder;
  }

  async handle_interaction(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      logger.warn(`CHEAT: Not a chat input command`);
      return;
    }
    if (interaction.commandName !== 'cheat') {
      logger.warn(`CHEAT: Wrong command name: ${interaction.commandName}`);
      return;
    }

    logger.info(`CHEAT: Processing cheat command for user: ${interaction.user.username}`);

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      logger.debug(`CHEAT: Deferred reply for ${interaction.user.username}`);
    } catch (e) {
      logger.error(`CHEAT: Failed to defer reply: ${e}`);
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const username = interaction.user.username;

    logger.info(`CHEAT: Subcommand: ${subcommand}, Username: ${username}`);

    try {
      if (subcommand === 'use') {
        logger.info(`CHEAT: Processing 'use' subcommand for ${username}`);
        const success = await this.use_cheat_day(username);
        logger.info(`CHEAT: Cheat day use result: ${success}`);

        if (success) {
          await this._create_cheat_day_thread(interaction.user.id, username);
          await Tracker.mark_completed(username);

          const remaining = await this.get_cheat_days(username);
          await interaction.editReply({
            content: `**Cheat day was successfully used.**\nYou have ${remaining} cheat day(s) remaining.`
          });
          logger.info(`CHEAT: Successfully responded to ${username} with cheat day use confirmation`);
        } else {
          await interaction.editReply({
            content: `**You have no cheat days available.**`
          });
          logger.info(`CHEAT: Informed ${username} they have no cheat days`);
        }
      } else if (subcommand === 'status') {
        logger.info(`CHEAT: Processing 'status' subcommand for ${username}`);
        const available = await this.get_cheat_days(username);
        await interaction.editReply({
          content: `You have ${available} cheat day(s) available.`
        });
        logger.info(`CHEAT: Successfully responded to ${username} with status: ${available} cheat days`);
      } else {
        logger.warn(`CHEAT: Unknown subcommand: ${subcommand}`);
      }
    } catch (e) {
      logger.error(`CHEAT: Error handling interaction: ${e}`);
      if (!interaction.replied) {
        try {
          await interaction.editReply({
            content: `**An error occurred while processing your request.**`
          });
        } catch (editError) {
          logger.error(`CHEAT: Failed to edit reply after error: ${editError}`);
        }
      }
    }
  }

  // --------- PRIVATE -----------
  private async _load_cheat_days(): Promise<void> {
    logger.info("CHEAT: Loading cheat days from reference channel");
    const channel = await this.client.channels.fetch(this.cheat_day_ref_channel_id) as any;
    if (!channel) {
      logger.error("CHEAT: Couldn't fetch cheat day channel.");
      return;
    }

    try {
      const messages = await channel.messages.fetch({ limit: 5 });
      const cheat = messages.find((m: any) => m.author.bot && m.content.includes(":"));

      if (!cheat) {
        logger.info("CHEAT: No existing cheat day message found. Initializing all users with 3 cheat days.");
        await this._initialize_all_users();
      } else {
        this.cheat_day_ref_message_id = cheat.id;
        const lines = cheat.content.split('\n');

        for (const line of lines) {
          const match = line.match(/^([^:]+):\s*(\d+)$/);
          if (match) {
            const username = match[1];
            const available = parseInt(match[2]) as 0 | 1 | 2 | 3;

            this.cheat_days.set(username, { username, available });
          }
        }
        logger.info(`CHEAT: Loaded ${this.cheat_days.size} user cheat day records.`);
      }
    } catch (e) {
      logger.error(`CHEAT: Failed to load cheat days: ${e}`);
      logger.error(`CHEAT: Error details: ${JSON.stringify(e)}`);
    }
  }

  private async _initialize_all_users(): Promise<void> {
    try {
      const tracked_users = Array.from(Tracker.user_statuses.keys());

      for (const username of tracked_users) {
        if (!this.cheat_days.has(username)) {
          this.cheat_days.set(username, {
            username: username,
            available: 3
          });
        }
      }

      logger.info(`CHEAT: Initialized ${this.cheat_days.size} users with 3 cheat days each using Tracker cache.`);
    } catch (e) {
      logger.error(`CHEAT: Failed to initialize users from Tracker: ${e}`);
    }
  }

  private async _update_ref_message(): Promise<void> {
    if (!this.cheat_day_ref_channel_id) {
      logger.error("CHEAT: No cheat day ref channel ID configured.");
      return;
    }

    const channel = await this.client.channels.fetch(this.cheat_day_ref_channel_id) as any;
    if (!channel) {
      logger.error(`CHEAT: Could not fetch channel ${this.cheat_day_ref_channel_id}.`);
      return;
    }

    const sorted_data = Array.from(this.cheat_days.values())
      .sort((a, b) => a.username.localeCompare(b.username));

    const lines = sorted_data.map(data => `${data.username}: ${data.available}`);
    const content = lines.join('\n');

    if (this.cheat_day_ref_message_id) {
      try {
        const message = await channel.messages.fetch(this.cheat_day_ref_message_id);
        await message.edit(content);
      } catch (e) {
        logger.error(`CHEAT: Failed to update ref message: ${e}.`);
        const message = await channel.send(content);
        this.cheat_day_ref_message_id = message.id;
      }
    } else {
      if (!content || content.trim() === '') {
        logger.error("CHEAT: Cannot send empty message content");
        return;
      }
      const message = await channel.send(content);
      this.cheat_day_ref_message_id = message.id;
      logger.info(`CHEAT: Sent initial cheat day message with ID ${message.id}`);
    }
  }

  private async _create_cheat_day_thread(user_id: string, username: string): Promise<void> {
    const threads_channel_id = process.env.THREADS_CHANNEL_ID;
    if (!threads_channel_id) {
      logger.error("CHEAT: THREADS_CHANNEL_ID not configured. I can't create a thread.");
      return;
    }

    try {
      const channel = await this.client.channels.fetch(threads_channel_id) as any;
      if (!channel) return;

      // Calculate day number like regular threads
      const start_date = new Date("10/04/2025");
      const current_date = new Date();
      const days_diff = Math.floor((current_date.getTime() - start_date.getTime()) / (1000 * 60 * 60 * 24));
      const day = Math.max(1, days_diff + 1);

      const date = new Date();
      const formatted = date.toLocaleDateString('en-US', {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit"
      }).replace(/\//g, '-');

      const thread_name = `archive-day-${day}-${username}-${formatted}`;

      const thread = await channel.threads.create({
        name: thread_name,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: `DEV: Cheat day for ${username}.`
      });

      await thread.members.add(user_id);
      await thread.members.add(this.client.user!.id);

      const date_str = date.toLocaleDateString('en-US', {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit"
      });

      await thread.send(`## CHEAT DAY WAS USED — ${date_str}`);

      logger.info(`CHEAT: Created cheat day thread for ${username} with day ${day}.`);
    } catch (e) {
      logger.error(`CHEAT: Failed to create cheat day thread: ${e}.`);
    }
  }

}

const cheat_service = new CheatService({
  client: discord_client,
  cheat_day_ref_channel_id: process.env.CHEAT_DAY_REF_CHANNEL_ID || "",
  cheat_day_ref_message_id: process.env.CHEAT_DAY_REF_MESSAGE_ID || ""
});

export { cheat_service };
