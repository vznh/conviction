import { EmbedBuilder } from 'discord.js';

export const EMBEDS = {
  STATUS: {
    STARTUP: new EmbedBuilder()
      .setColor('#0B2B26')
      .setTitle('🤖')
      .setDescription('Bot is online!')
      .setTimestamp(),

    SHUTDOWN: new EmbedBuilder()
      .setColor('#4B0800')
      .setTitle('🤖')
      .setDescription('Bot is offline.')
      .setTimestamp(),

    CRASH: new EmbedBuilder()
      .setColor('#C35800')
      .setTitle('🤖')
      .setDescription('Bot has ran into an issue. Requires manual restart.')
      .setTimestamp(),

    DEFAULT: new EmbedBuilder()
      .setColor('#00699A')
      .setTitle('🤖')
      .setDescription('Bot is running functionally.')
      .setTimestamp(),

    DELETE_THREAD: new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🧱')
      .setDescription('Use this if the bot is acting up.')
      .setTimestamp(),
  },
} as const;
