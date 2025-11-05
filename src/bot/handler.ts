import {
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ThreadChannel,
  ChannelType,
  MessageFlags
} from "discord.js";
import { logger } from "@/lib/logger";
import { MESSAGES } from "@/constants/messages";
import { LOGISTICS } from "@/constants/logistics";
import { discord_client } from "@/lib/client";
import { entry_service } from "@/services/entry-service";

interface Options {
  client: Client;
  threads_channel_id: string;
  control_message_id?: string;
}

interface Structure {
  create(
    user_id: string,
    username: string,
    day: number
  ): Promise<ThreadChannel | null>;
  setup(): Promise<void>;
  grab(user_id: string): Promise<void>;
}

class Handler implements Structure {
  public client!: Client;
  public threads_channel_id!: string;
  public control_message_id?: string;

  constructor(options: Options) {
    if (
      !options ||
      !options.client ||
      !options.threads_channel_id
    ) {
      logger.fatal("DEV: Thread handler was not instantiated correctly.");
    }

    Object.assign(this, options);
  }

  async setup(): Promise<void> {
    const channel = await this.client.channels.fetch(this.threads_channel_id) as any;
    if (!channel) return;

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_entry')
          .setLabel("Create an entry")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('view_entries')
          .setLabel("View previous entries")
          .setStyle(ButtonStyle.Secondary)
      );

    if (this.control_message_id) {
      try {
        const message = await channel.messages.fetch(this.control_message_id);
        await message.edit({
          content: MESSAGES.ACTIONS.INIT,
          components: [row]
        });
      } catch {
        const message = await channel.send({
          content: MESSAGES.ACTIONS.INIT,
          components: [row]
        });
        this.control_message_id = message.id;
      }
    } else {
      const message = await channel.send({
        content: MESSAGES.ACTIONS.INIT,
        components: [row]
      });
      this.control_message_id = message.id;
    }

    this._setup_listeners(channel);
  }

  async create(
    user_id: string,
    username: string,
    day: number
  ): Promise<ThreadChannel | null> {
    try {
      const channel = await this.client.channels.fetch(this.threads_channel_id) as any;
      if (!channel) {
        logger.error("DEV: Threads channel can't be found.");
        return null;
      }

      const date = new Date();
      const formatted = date.toLocaleDateString('en-US', {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit"
      }).replace(/\//g, '-');

      // thread stuff here
      const name = `day-${day}-${username}-${formatted}`;
      // thread send here
      const thread = await channel.threads.create({
        name: name,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: `DAY${day} for ${username}`
      });

      await thread.members.add(user_id);
      await thread.members.add(this.client.user!.id);

      const guild = await this.client.guilds.fetch(process.env.GUILD_ID || '');
      const member = await guild.members.fetch(user_id);
      
      const embeds = await entry_service.create_entry_embeds(member);
      
      for (const embed of embeds) {
        await thread.send({ embeds: [embed] });
      }

      logger.info(`DEV: Created thread: ${name} for ${username}.`);
      return thread;
    } catch (e) {
      logger.error(`DEV: Failed to create thread. ${e}`);
      return null;
    }
  }

  async grab(user_id: string) {
    try {
      const user = await this.client.users.fetch(user_id);
      if (!user) return;

      const channel = await this.client.channels.fetch(this.threads_channel_id) as any;
      if (!channel) return;

      const active_threads = channel.threads.cache;
      const user_threads = active_threads.filter((thread: any) => thread.members.cache.has(user_id));

      if (user_threads.size === 0) {
        try {
          await user.send(MESSAGES.GRAB.NONE);
        } catch (dm_error) {
          logger.error(`ERROR: Could not DM user ${user_id}: ${dm_error}`);
        }
        return;
      }

      const entries = Array.from(user_threads.values())
        .map((thread: any) => {
          const match = thread.name.match(/day-(\d+)-/i);
          const day = match ? parseInt(match[1]) : 0;
          return { day, url: thread.url };
        })
        .sort((a, b) => a.day - b.day)
        .map(entry => `DAY${entry.day.toString().padStart(2,
          '0')} - ${entry.url}`)
        .join('\n');

      try {
        await user.send(`## Entries\n${entries}`);
      } catch (dm_error) {
        logger.error(`ERROR: Could not DM entries to user ${user_id}: ${dm_error}`);
      }
    } catch (e) {
      logger.error(`ERROR: Failed to grab entries for ${user_id} : ${e}`);
    }
  }

  private _setup_listeners(channel: any): void {
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton() || interaction.channelId !== channel.id) return;
      if (interaction.customId === 'create_entry') {
        await this._create_entry(interaction);
      } else if (interaction.customId === 'view_entries') {
        await this._view_entries(interaction)
      }
    });
  }

  private async _create_entry(interaction: any): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = await this.client.channels.fetch(this.threads_channel_id) as any;
    if (!channel) return;

    const start_date = new Date(LOGISTICS.DATETIME_START.DATE);
    const current_date = new Date();
    const days_diff = Math.floor((current_date.getTime() - start_date.getTime()) / (1000 * 60 * 60 * 24));
    const day = Math.max(1, days_diff + 1);

    const thread = await this.create(
      interaction.user.id,
      interaction.user.username,
      day
    );

    if (!thread) {
      await interaction.editReply({
        content: "**ERROR**: Failed to create entry. Please try once more."
      })
    } else {
      await interaction.editReply({
        content: "**SUCCESS**: Created your thread!"
      })
    }
  }

  private async _view_entries(interaction: any): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await this.grab(interaction.user.id);
    await interaction.editReply({
      content: "**SUCCESS**: Your entries have been sent through DMs."
    });
  }
}

const Actions = new Handler({
  client: discord_client,
  threads_channel_id: process.env.THREADS_CHANNEL_ID || "",
  control_message_id: process.env.CONTROL_MESSAGE_ID,
});

export { Actions }
