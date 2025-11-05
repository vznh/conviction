import { Client } from "discord.js";
import { logger } from "@/lib/logger";
import { discord_client } from "@/lib/client";

interface Options {
  client: Client;
  statuses_channel_id: string;
  statuses_message_id?: string;
}

interface Structure {
  setup(): Promise<void>;
  mark_completed(username: string): Promise<void>;
  scan_all_users(): Promise<void>;
}

class Status implements Structure {
  public client!: Client;
  public statuses_channel_id!: string;
  public statuses_message_id?: string;

  private user_statuses: Map<string, boolean> = new Map();
  private last_reset: string = '';

  constructor(options: Options) {
    if (
      !options ||
      !options.client ||
      !options.statuses_channel_id
    ) {
      logger.error("DEV: Tracker was not instantiated correctly");
    }

    Object.assign(this, options);
  }

  async setup(): Promise<void> {
    logger.info("Setting up tracker.");
    const now = new Date();
    const pst = new Date(now.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles"
    }));
    const td = pst.toISOString().split('T')[0];
    const require_reset = this.last_reset !== td;
    logger.debug("Times are set-up.");
    logger.debug("Scanning all users.");
    await this.scan_all_users();
    logger.debug("Users have been scanned.");
    if (require_reset) {
      await this._reset_statuses(td!);
      logger.info("Detected new day, so I reset all statuses.");
    } else {
      await this._rebuild_statuses(td);
      logger.info("Rebuilt statuses from existing threads.");
    }

    this._check_schedule();
    logger.info("Tracker was set-up correctly.");
  }

  async mark_completed(username: string): Promise<void> {
    this.user_statuses.set(username, true);
    await this._update_status_message();
  }

  async scan_all_users(): Promise<void> {
    const guild_id = process.env.GUILD_ID;
    if (!guild_id) {
      logger.error("STATUS: GUILD_ID not configured");
      return;
    }

    try {
      const guild = await this.client.guilds.fetch(guild_id);
      if (!guild) return;

      const members = await guild.members.fetch();

      for (const [_, member] of members) {
        if (!member.user.bot && !this.user_statuses.has(member.user.username)) {
          this.user_statuses.set(member.user.username, false);
        }
      }

      logger.info(`STATUS: Scanned ${members.size} users`);
    } catch (e) {
      logger.error(`STATUS: Failed to scan users: ${e}`);
    }
  }

  private async _reset_statuses(today: string): Promise<void> {
    const users = Array.from(this.user_statuses.keys());
    this.user_statuses.clear();

    for (const username of users) {
      this.user_statuses.set(username, false);
    }

    this.last_reset = today;
    await this._update_status_message();
  }

  private async _rebuild_statuses(today: string): Promise<void> {
    const threads_channel_id = process.env.THREADS_CHANNEL_ID;
    if (!threads_channel_id) {
      logger.error("THREADS_CHANNEL_ID not configured.");
      return;
    }

    const channel = await this.client.channels.fetch(threads_channel_id) as any;
    if (!channel) return;

    const active_threads = channel.threads.cache;
    const today_str = today.replace(/-/g, '');

    for (const [, thread] of active_threads) {
      const match = thread.name.match(/day-(\d+)-([^-]+)-([^-]+)/);
      if (match && match[3] === today_str) {
        const username = match[2];
        const completed = thread.name.startsWith('archive-');
        this.user_statuses.set(username, completed);
      }
    }

    this.last_reset = today;
    await this._update_status_message();
  }

  private _check_schedule(): void {
    setInterval(async () => {
      const now = new Date();
      const pst = new Date(now.toLocaleString("en-US", {
        timeZone: "America/Los_Angeles"
      }));

      const hours = pst.getHours();
      const minutes = pst.getMinutes();

      if (hours === 0 && minutes === 1) {
        const today = pst.toISOString().split('T')[0];
        if (this.last_reset !== today) {
          await this._reset_statuses(today!);
          logger.info("STATUS: Daily reset completed");
        }
      }
    }, 60000);
  }

  private async _update_status_message(): Promise<void> {
    const channel = await this.client.channels.fetch(this.statuses_channel_id) as any;
    if (!channel) return;

    const sorted_users = Array.from(this.user_statuses.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    const lines = [
      '╭' + '─'.repeat(37) + '╮',
      '│' + ' '.repeat(14) + '❊ STATUSES' + ' '.repeat(13) + '│',
      '├' + '─'.repeat(37) + '┤'
    ];

    for (const [username, completed] of sorted_users) {
      const status = completed ? 'COMPLETED' : 'NOT COMPLETED';
      const padding = Math.max(1, 22 - username.length);
      lines.push(`│ ${username}${' '.repeat(padding)}${status} │`);
    }

    lines.push('├' + '─'.repeat(37) + '┤');

    const now = new Date();
    const pst = new Date(now.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles"
    }));

    const formatted = pst.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'long'
    }).replace(/, (?=\d)/, ' ');

    const time_parts = `${formatted}`.match(/(.{1,35})\s+/g) || [];
    for (const part of time_parts) {
      lines.push('│ ' + part.trim().padEnd(35) + ' │');
    }

    lines.push('╰' + '─'.repeat(37) + '╯');

    const content = '```\n' + lines.join('\n') + '\n```';

    if (this.statuses_message_id) {
      try {
        const message = await channel.messages.fetch(this.statuses_message_id);
        await message.edit(content);
      } catch {
        const message = await channel.send(content);
        this.statuses_message_id = message.id;
      }
    } else {
      const message = await channel.send(content);
      this.statuses_message_id = message.id;
    }
  }
}

const Tracker = new Status({
  client: discord_client,
  statuses_channel_id: process.env.STATUSES_CHANNEL_ID || "",
  statuses_message_id: process.env.STATUSES_MESSAGE_ID || ""
});

export { Tracker };
