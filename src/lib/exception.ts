import { Client, EmbedBuilder } from "discord.js";
import { discord_client } from "@/lib/client";
import { logger } from "@/lib/logger";

interface Options {
  client: Client;
  error_channel_id: string;
}

interface Structure {
  catch_exception(
    error_name: string,
    error_type: string,
    error_code: string,
    user_id: string,
    context: string
  ): Promise<void>;
}

class Exception implements Structure {
  public client!: Client;
  public error_channel_id!: string;

  constructor(options: Options) {
    if (
      !options ||
      !options.client ||
      !options.error_channel_id
    ) {
      logger.error("DEV: Exception wasn't instantiated correctly. Continuing.");
    }

    Object.assign(this, options);
  }

  async catch_exception(
    error_name: string,
    error_type: string,
    error_code: string,
    user_id: string,
    context: string
  ): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(this.error_channel_id);
      if (!channel || !('send' in channel)) {
        logger.fatal("Can't access error channel.");
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle(`❈ EXCEPTION`)
        .addFields(
          { name: "<T>", value: `\`${error_type}\``, inline: true },
          { name: "UID", value: `\`${user_id}\``, inline: true },
          { name: "CTX", value: `\`${context}\``, inline: false }
        )
        .addFields(
          { name: "CODE", value: `\`\`\`${error_code}\`\`\`` }
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      logger.error("CLIENT: Error encountered and logged successfully.");
    } catch (e) {
      logger.fatal(`FAILURE: Can't send error report. ${e}`);
    }
  }
}

const catch_exception = new Exception({
  client: discord_client,
  error_channel_id: process.env.ERROR_CHANNEL_ID || ''
});
export { catch_exception }
