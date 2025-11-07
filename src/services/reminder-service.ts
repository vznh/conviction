import {
  Client,
  Interaction,
  SlashCommandBuilder,
  MessageFlags
} from "discord.js";

import { logger } from "@/lib/logger";
import { discord_client } from "@/lib/client";
import { Tracker } from "@/bot/statuses";

interface Alarm {
  user_id: string;
  username: string;
  time: string;
  enabled: boolean;
  message_id?: string;
}

interface Structure {
  set_reminder(user_id: string, username: string, time: string): Promise<void>;
  load_alarms(): Promise<void>;
  init_scheduler(): void;
  get_command_definition(): SlashCommandBuilder;
  handle_interaction(interaction: Interaction): Promise<void>;
}

class ReminderService implements Structure {
  private client: Client;
  private alarms: Alarm[] = [];
  private last_check_date: string = '';

  constructor(client: Client) {
    this.client = client;
  }

  async load_alarms(): Promise<void> {
    const channel_id = process.env.ALARMS_REF_CHANNEL_ID;
    if (!channel_id) return;

    const channel = await this.client.channels.fetch(channel_id) as any;
    if (!channel) return;

    const messages = await channel.messages.fetch({ limit: 100 });

    this.alarms = [];
    for (const [message_id, message] of messages) {
      if (message.content.includes("USER_ID:")) {
        const lines = message.content.split('\n');
        const alarm: Alarm = {
          user_id: lines[1].split(': ')[1],
          username: lines[2].split(': ')[1].replace(/"/g, ''),
          time: lines[3].split(': ')[1].replace(/"/g, ''),
          enabled: lines[4].split(': ')[1] === 'true',
          message_id
        };
        this.alarms.push(alarm);
      }
    }

    logger.info(`DEV: Loaded ${this.alarms.length} alarms.`);
  }

  async save_alarm(alarm: Alarm): Promise<void> {
    const channel_id = process.env.ALARMS_REF_CHANNEL_ID;
    if (!channel_id) throw new Error('ALARMS_REF_CHANNEL_ID not configured');

    const channel = await this.client.channels.fetch(channel_id) as any;
    const created = new Date().toISOString();

    const content = `\`\`\`
USER_ID: ${alarm.user_id}
USERNAME: "${alarm.username}"
TIME: "${alarm.time}"
ENABLED: ${alarm.enabled}
CREATED: ${created}
\`\`\``;

    const message = await channel.send(content);
    alarm.message_id = message.id;
    this.alarms.push(alarm);
  }

  async set_reminder(user_id: string, username: string, time: string): Promise<void> {
    const time_regex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!time_regex.test(time)) {
      throw new Error('Invalid time format. Use HH:MM (24-hour)');
    }

    await this.save_alarm({ user_id, username, time, enabled: true });
    logger.info(`Alarm set for ${username} at ${time}.`);
  }

  async check_and_send_reminders(): Promise<void> {
    const now = new Date();
    const pst = new Date(now.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles"
    }));

    const today_str = pst.toISOString().split('T')[0];
    const current_time = pst.toTimeString().slice(0, 5);

    if (this.last_check_date === today_str) return;

    for (const alarm of this.alarms) {
      if (!alarm.enabled || alarm.time !== current_time) continue;

      const user_status = Tracker.get_user_status(alarm.username);
      if (!user_status) {
        try {
          const user = await this.client.users.fetch(alarm.user_id);
          await user.send('# ⏰⏰⏰\nSubmit some parts of your entry!');
          logger.info(`DEV: Sent reminder to ${alarm.username}`);
        } catch (error) {
          logger.error(`DEV: Failed to send reminder: ${error}`);
        }
      }
    }

    this.last_check_date = today_str!;
  }

  init_scheduler(): void {
    setInterval(() => this.check_and_send_reminders(), 60000);
  }

  get_command_definition(): SlashCommandBuilder {
    return new SlashCommandBuilder()
      .setName('reminder')
      .setDescription('Manage reminders for your 75.')
      .addSubcommand(sub =>
        sub
          .setName('set')
          .setDescription('Set a daily reminder.')
          .addStringOption(opt =>
            opt
              .setName('time')
              .setDescription('Time in HH:MM (24-hour format). Ex: 16:50 for 4:50PM.')
              .setRequired(true)
          )
      ) as SlashCommandBuilder;
  }

  async handle_interaction(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'reminder') return;

    const time = interaction.options.getString('time', true);

    try {
      await this.set_reminder(
        interaction.user.id,
        interaction.user.username,
        time
      );

      let response = `Reminder successfully set for ${time} PST.`;

      const guild = await this.client.guilds.fetch(process.env.GUILD_ID!);
      const member = await guild.members.fetch(interaction.user.id);

      if (member.presence?.status === 'dnd') {
        response += '\n\n#⚠️\nYour status is on DND. The bot won\'t send reminders while you\'re on DND.\nPlease disable DND if you want to receive reminders.';
      }

      await interaction.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await interaction.reply({
        content: `Reminder failed for setting at ${time}PST.\nDEV: ${error instanceof Error ? error.message : 'Failed'}`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

const reminder_service = new ReminderService(discord_client);

export { reminder_service };
