import { Client, EmbedBuilder, GatewayIntentBits } from "discord.js";
import { Actions } from "@/bot/handler";
import { logger } from "@/lib/logger";
import { discord_client } from "@/lib/client";
import { MESSAGES } from "@/constants/messages";
import { EMBEDS } from "@/constants/embeds";

interface Options {
  client: Client;
  token: string;

  status_channel_id: string;
  status_message_id?: string;

}

interface Structure {
  start(): Promise<void>;
  shutdown(): Promise<void>;
  setup(): void;
  update(embed: EmbedBuilder): Promise<void>;
}

class Bot implements Structure {
  public client!: Client;
  private token!: string;

  public status_channel_id!: string;
  public status_message_id?: string;


  constructor(options: Options) {
    if (
      options === null ||
      Object.keys(options).length !== 4 || // place amt of required keys here
      Object.keys(options).length === 0
    ) {
      logger.fatal("DEV: Bot was not instantiated with all of the correct variables.");
    }

    Object.assign(this, options);
  }

  async start(): Promise<void> {
    if (!this.token) {
      logger.error(MESSAGES.ERRORS.NO_TOKEN);
      process.exit(1);
    }

    this.setup();
    logger.info(MESSAGES.LOGS.INITIALIZING);

    try {
      await this.client.login(this.token);
      logger.info(MESSAGES.LOGS.CONNECTED);
    } catch (e) {
      logger.fatal(`${MESSAGES.ERRORS.CONNECTION_FAILED}:\n${e}`);
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    await this.update(EMBEDS.STATUS.SHUTDOWN);
    this.client.destroy();
    logger.info(MESSAGES.LOGS.SHUTDOWN_COMPLETE);
    process.exit(0);
  }

  async update(embed: EmbedBuilder): Promise<void> {
    if (!this.status_channel_id) {
      logger.error("* No SCI was configured.");
      return;
    }

    try {
      const channel = await this.client.channels.fetch(this.status_channel_id) as any;
      if (!channel) {
        logger.error("DEV: No channel was found or bot lacks permissions.");
        return;
      }

      if (this.status_message_id) {
        try {
          const message = await channel.messages.fetch(this.status_message_id);
          await message.edit({ embeds: [embed] });
        } catch {
          const message = await channel.send({ embeds: [embed] });
          this.status_message_id = message.id;
        }
      } else {
        const message = await channel.send({ embeds: [embed] });
        this.status_message_id = message.id;
      }
    } catch (e) {
      logger.error(`${MESSAGES.ERRORS.STATUS_UPDATE_FAILURE}: ${e}`);
    }
  }

  setup() {
    this.client.once('clientReady', () => {
      logger.info(`BOT: ${this.client.user?.tag}`);
      this.update(EMBEDS.STATUS.STARTUP);

      Actions
        .setup()
        .catch((e: any) => {
          logger.error(`ERROR: Failed to set-up handler: ${e}`);
        })
    });

    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGUSR2', () => this.shutdown());
    process.on('uncaughtException', (e) => {
      logger.fatal(`DEV: Uncaught exception. ${e}`);
      this.shutdown();
    })
    process.on('unhandledRejection', (reason, promise) => {
      logger.fatal(`DEV: Unhandled exception at ${promise}: ${reason}`);
      this.shutdown();
    });
  }
}

const Manager = new Bot({
  client: discord_client,
  token: process.env.DISCORD_TOKEN || "",
  status_channel_id: process.env.STATUS_CHANNEL_ID || "",
  status_message_id: process.env.STATUS_MESSAGE_ID || "",
});

export { Manager };
