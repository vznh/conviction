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
  },
} as const;
