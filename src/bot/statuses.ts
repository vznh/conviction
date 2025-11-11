import { Client } from "discord.js";

import { logger } from "@/lib/logger";
import { discord_client } from "@/lib/client";

interface Options {
  client: Client;
  statuses_channel_id: string;
  statuses_message_id?: string;
  history_message_id?: string;
}

interface Structure {
  setup(): Promise<void>;
  mark_completed(username: string): Promise<void>;
  scan_all_users(): Promise<void>;
  get_user_status(username: string): boolean | undefined;
}

class Status implements Structure {
  public client!: Client;
  public channels: {
    statuses_id: string;
    statuses_message_id?: string;
    history_message_id?: string;
  } = { statuses_id: "" };

  public tracking: {
    user_statuses: Map<string, boolean>;
    user_histories: Map<string, string[]>;
    last_reset: string;
  } = {
    user_statuses: new Map(),
    user_histories: new Map(),
    last_reset: ''
  };

  constructor(options: Options) {
    if (
      !options ||
      !options.client ||
      !options.statuses_channel_id
    ) {
      logger.error("Tracker was not instantiated correctly.");
    }

    this.client = options.client;
    this.channels.statuses_id = options.statuses_channel_id;
    this.channels.statuses_message_id = options.statuses_message_id;
    this.channels.history_message_id = options.history_message_id;
  }

  async setup(): Promise<void> {
    logger.info("Setting up tracker.");
    const now = new Date();
    const pst = new Date(now.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles"
    }));

    const td = pst.getFullYear() + '-' +
               String(pst.getMonth() + 1).padStart(2, '0') + '-' +
               String(pst.getDate()).padStart(2, '0');
    await this.scan_all_users();

    await this._rebuild_statuses(td!);
    logger.info("Rebuilt statuses from existing threads.");

    logger.info("Building history from threads.");
    await this._build_history_from_threads();
    await this._update_history_message();
    logger.info("Completed building history.");

    this._check_schedule();
    logger.info("Tracker was set up correctly.");
  }

  async mark_completed(username: string): Promise<void> {
    this.tracking.user_statuses.set(username, true);

    const today = this._get_current_day();
    if (today > 0) {
      await this._update_user_history(username, today - 1, this._get_day_character(today));
    }

    await this._update_status_message();
  }

  async scan_all_users(): Promise<void> {
    const guild_id = process.env.GUILD_ID;
    if (!guild_id) {
      return;
    }

    try {
      const guild = await this.client.guilds.fetch(guild_id);
      if (!guild) return;

      const members = await guild.members.fetch();

      for (const [_, member] of members) {
        if (!member.user.bot) {
          const track_name = member.user.username;
          if (!this.tracking.user_statuses.has(track_name)) {
            this.tracking.user_statuses.set(track_name, false);
          }
        }
      }

      logger.info(`Scanned ${members.size} users.`);
    } catch (e) {
      logger.error(`Failed to scan users: ${e}`);
    }
  }

  get_user_status(username: string): boolean | undefined {
    return this.tracking.user_statuses.get(username);
  }


  // --------- PRIVATE -----------
  private async _reset_statuses(today: string): Promise<void> {
    const users = Array.from(this.tracking.user_statuses.keys());
    this.tracking.user_statuses.clear();

    for (const username of users) {
      this.tracking.user_statuses.set(username, false);
    }

    this.tracking.last_reset = today;
    await this._update_status_message();
  }

  private async _rebuild_statuses(today: string): Promise<void> {
    const threads_channel_id = process.env.THREADS_CHANNEL_ID;
    if (!threads_channel_id) {
      logger.warn("THREADS_CHANNEL_ID not configured.");
      return;
    }

    const channel = await this.client.channels.fetch(threads_channel_id) as any;
    if (!channel) return;

    await channel.threads.fetchActive();
    const active_threads = channel.threads.cache;

    const [year, month, day] = today.split('-');
    const today_formatted = `${month}-${day}-${year!.slice(2)}`;


    // reset to all NC first
    for (const [username] of this.tracking.user_statuses) {
      this.tracking.user_statuses.set(username, false);
    }

    for (const [, thread] of active_threads) {
      const clean_name = thread.name.replace('archive-', '');
      const match = clean_name.match(/day-(\d+)-([^-]+)-(.+)/);
      if (match) {
        const username = match[2];
        const date_part = match[3];
        const completed = thread.name.startsWith('archive-');


        if (date_part === today_formatted) {
          this.tracking.user_statuses.set(username, completed);
          logger.debug(`Set ${username} status to ${completed ? 'COMPLETED' : 'NOT COMPLETED'} from thread ${thread.name}`);
        } else {
        }
      }
    }

    this.tracking.last_reset = today;
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
        if (this.tracking.last_reset !== today) {
          await this._reset_statuses(today!);
          logger.info("Daily reset completed.");
        }
      }

      // 11:59 PM
      if (hours === 23 && minutes === 59) {
        await this._mark_incomplete_days();
        await this._update_history_message();
        logger.info("Updated history at 11:59 PM.");
      }
    }, 60000);
  }

  private async _update_status_message(): Promise<void> {
    const channel = await this.client.channels.fetch(this.channels.statuses_id) as any;
    if (!channel) return;

    const sorted_users = Array.from(this.tracking.user_statuses.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    const lines = [
      '╭' + '─'.repeat(37) + '╮',
      '│' + ' '.repeat(14) + '❊ STATUSES' + ' '.repeat(13) + '│',
      '├' + '─'.repeat(37) + '┤'
    ];

    for (const [username, completed] of sorted_users) {
      const status = completed ? 'COMPLETED' : 'NOT COMPLETED';
      const username_length = username.length + 2; // +2 for the leading space and space before status
      const status_length = status.length;
      const padding = Math.max(1, 37 - username_length - status_length);
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

    if (this.channels.statuses_message_id) {
      try {
        const message = await channel.messages.fetch(this.channels.statuses_message_id);
        await message.edit(content);
      } catch {
        const message = await channel.send(content);
        this.channels.statuses_message_id = message.id;
      }
    } else {
      const message = await channel.send(content);
      this.channels.statuses_message_id = message.id;
    }
  }

  private _get_current_day(): number {
    const start_date = new Date("10/04/2025");
    const current_date = new Date();
    const days_diff = Math.floor((current_date.getTime() - start_date.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, days_diff + 1);
  }

  private guild_members_cache: Map<string, any> = new Map();

  private async _build_history_from_threads(): Promise<void> {
    const threads_channel_id = process.env.THREADS_CHANNEL_ID;
    if (!threads_channel_id) return;

    const channel = await this.client.channels.fetch(threads_channel_id) as any;
    if (!channel) return;

    await this._build_member_cache();

    for (const [username] of this.tracking.user_statuses) {
      const history = new Array(75).fill('x');
      this.tracking.user_histories.set(username, history);
    }

    const current_day = this._get_current_day();

    await channel.threads.fetchActive();
    const active_threads = channel.threads.cache;

    for (const [, thread] of active_threads) {
      await this._process_thread_for_history(thread, current_day);
    }

    const fetch_type = process.env.NODE_ENV === 'development' ? 'public' : 'private';
    let has_more = true;
    let before: any = null;

    while (has_more) {
      const archived = await channel.threads.fetchArchived({
        limit: 100,
        type: fetch_type,
        before
      });

      for (const [, thread] of archived.threads) {
        await this._process_thread_for_history(thread, current_day);
      }

      has_more = archived.hasMore;
      before = archived.threads.last()?.id;
    }
  }

  private async _build_member_cache(): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(process.env.GUILD_ID || '');
      if (!guild) return;

      const members = await guild.members.fetch();
      for (const [, member] of members) {
        this.guild_members_cache.set(member.user.username, member);
        this.guild_members_cache.set(member.displayName, member);
      }
      logger.info(`Cached ${members.size} guild members.`);
    } catch (e) {
      logger.error(`Failed to build member cache: ${e}`);
    }
  }

  private async _process_thread_for_history(thread: any, current_day: number): Promise<void> {
    const clean_name = thread.name.replace('archive-', '');

    let match = clean_name.match(/day-(\d+)-([^-]+)-(.+)/);
    let is_old_pattern = false;

    if (!match) {
      match = clean_name.match(/([^-]+)-day-(\d+)/);
      if (match) {
        // Old pattern: {server_username}-day-{day_number}
        is_old_pattern = true;
        // Swap groups for consistency: [null, day, username]
        match = [null, match[2], match[1], null];
      }
    } else {
    }

    if (match) {
      const day_num = parseInt(match[1]);
      let username = match[2];
      let original_extracted = username;

      if (day_num < 1 || day_num > 75 || day_num > current_day) {
        return;
      }

      const member = this.guild_members_cache.get(username);
      if (member) {
        if (is_old_pattern) {
          username = member.displayName;
        } else {
          username = member.displayName || member.user.username;
        }
      } else {
        logger.warn(`Could not find member for ${is_old_pattern ? 'display name' : 'username'}: ${username}`);
      }

      if (!this.tracking.user_histories.has(username)) {
        const history = new Array(75).fill('x');
        this.tracking.user_histories.set(username, history);
      }

      const history = this.tracking.user_histories.get(username)!;

      history[day_num - 1] = this._get_day_character(day_num);
      logger.debug(`Day ${day_num} for ${username}: COMPLETED`);
    }
  }

  private _get_day_character(day: number): string {
    const day_in_row = ((day - 1) % 10) + 1;
    return day_in_row === 10 ? '0' : day_in_row.toString();
  }

  private async _update_user_history(username: string, day_index: number, status: string): Promise<void> {
    if (!this.tracking.user_histories.has(username)) {
      const history = new Array(75).fill('x');
      this.tracking.user_histories.set(username, history);
    }

    const history = this.tracking.user_histories.get(username)!;
    if (day_index >= 0 && day_index < 75) {
      history[day_index] = status;
      await this._update_history_message();
    }
  }

  private _generate_history_display(username: string): string[] {
    const history = this.tracking.user_histories.get(username);
    if (!history) return [];

    const current_day = this._get_current_day();
    const rows: string[] = [];

    for (let row = 0; row < 8; row++) {
      const start_index = row * 10;
      const end_index = row === 7 ? Math.min(start_index + 5, 75) : start_index + 10;
      const row_data = [];

      for (let i = start_index; i < end_index; i++) {
        const day_num = i + 1;

        if (day_num > current_day) {
          row_data.push('.');
        } else {
          row_data.push(history[i] || 'x');
        }
      }

      rows.push(`${row + 1} ${row_data.join('')}`);
    }

    return rows;
  }

  private async _update_history_message(): Promise<void> {
    if (!this.channels.statuses_id) return;

    const channel = await this.client.channels.fetch(this.channels.statuses_id) as any;
    if (!channel) return;

    const lines = ['```'];

    const sorted_users = Array.from(this.tracking.user_statuses.keys())
      .sort((a, b) => a.localeCompare(b));

    for (const username of sorted_users) {
      if (!this.tracking.user_histories.has(username)) {
        const history = new Array(75).fill('x');
        this.tracking.user_histories.set(username, history);
      }

      lines.push(`${username}:`);
      const history_rows = this._generate_history_display(username);
      lines.push(...history_rows);
      lines.push('');
    }

    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.push('```');

    const content = lines.join('\n');

    if (this.channels.history_message_id) {
      try {
        const message = await channel.messages.fetch(this.channels.history_message_id);
        await message.edit(content);
      } catch {
        const message = await channel.send(content);
        this.channels.history_message_id = message.id;
      }
    } else {
      const message = await channel.send(content);
      this.channels.history_message_id = message.id;
    }
  }

  private async _mark_incomplete_days(): Promise<void> {
    const current_day = this._get_current_day();

    for (const [_, history] of this.tracking.user_histories) {
      for (let i = 0; i < Math.min(current_day - 1, 75); i++) {
        if (history[i] === '.') {
          history[i] = 'x';
        }
      }
    }
  }
}

const Tracker = new Status({
  client: discord_client,
  statuses_channel_id: process.env.STATUSES_CHANNEL_ID || "",
  statuses_message_id: process.env.STATUSES_MESSAGE_ID || "",
  history_message_id: process.env.HISTORY_MESSAGE_ID || ""
});

export { Tracker };
