import { discord_client } from "@/lib/client";
import { logger } from "@/lib/logger";
import { colors } from "@/constants/colors";

import {
  Client,
  Role,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from "discord.js";
import { MESSAGES } from "@/constants/messages";

interface Options {
  client: Client;
  marketplace_channel_id: string;
  marketplace_message_id?: string;
}

interface Structure {
  create(
    user_id: string,
    guild_id: string,
    data: { name: string; desc: string; type: "text" | "image" | "both" },
  ): Promise<void>;
  fetch(): Promise<Role[]>;
  setup(): Promise<void>;
}

class Controller implements Structure {
  public client!: Client;
  public marketplace_channel_id!: string;
  public marketplace_message_id?: string;

  constructor(options: Options) {
    if (
      options === null ||
      Object.keys(options).length !== 3 || // place amt of required keys here
      Object.keys(options).length === 0
    ) {
      logger.fatal(
        "DEV: Bot was not instantiated with all of the correct variables.",
      );
    }

    Object.assign(this, options);
  }

  async create(
    user_id: string,
    guild_id: string,
    data: { name: string; desc: string; type: "text" | "image" | "both" },
  ): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(guild_id);
      if (!guild) return;

      const color_keys = Object.keys(colors);
      const random_key =
        color_keys[Math.floor(Math.random() * color_keys.length)];
      const color = parseInt(random_key!);
      const role = await guild.roles.create({
        name: data.name,
        color: color,
        reason: `✢ Role created by user ${user_id}.`,
      });

      await this._save_to_marketplace({
        role_id: role.id,
        name: data.name,
        desc: data.desc,
        type: data.type,
        creator: user_id,
      });

      const member = await guild.members.fetch(user_id);
      if (member) {
        await member.roles.add(role);
      }

      logger.info(`Created role ${data.name} (${role.id}) for ${user_id}`);
    } catch (e) {
      logger.error(`ERROR: Failed to create role, found at ${e}`);
    }
  }


  async fetch(): Promise<Role[]> {
    try {
      const roles_data = await this._parse_marketplace();
      const all_roles: Role[] = [];

      for (const role_data of roles_data) {
        for (const guild of this.client.guilds.cache.values()) {
          const role = guild.roles.cache.get(role_data.role_id);
          if (role) {
            all_roles.push(role);
            break;
          }
        }
      }

      return all_roles;
    } catch (e) {
      logger.error(`ERROR: Failed to fetch roles: ${e}`);
      return [];
    }
  }

  async select(
    user_id: string,
    guild_id: string,
    role_ids: string[],
  ): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(guild_id);
      if (!guild) return;

      const member = await guild.members.fetch(user_id);
      if (!member) return;

      const valid_roles = await this._parse_marketplace();
      const roles_to_add = [];

      for (const role_id of role_ids) {
        const role_data = valid_roles.find((r) => r.role_id === role_id);
        if (role_data) {
          const role = guild.roles.cache.get(role_id);
          if (role) {
            roles_to_add.push(role);
          }
        }
      }

      await member.roles.add(roles_to_add);
      logger.info(`Added ${roles_to_add.length} roles to ${user_id}`);
    } catch (e) {
      logger.error(`ERROR: Failed to select roles for ${user_id}: ${e}`);
    }
  }

  async setup(): Promise<void> {
    const channel = (await this.client.channels.fetch(
      this.marketplace_channel_id,
    )) as any;
    if (!channel) return;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("create_role")
        .setLabel("Create a role")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("select_role")
        .setLabel("Select a role")
        .setStyle(ButtonStyle.Primary),
    );

    if (this.marketplace_message_id) {
      try {
        const message = await channel.messages.fetch(
          this.marketplace_message_id,
        );
        await message.edit({
          content: MESSAGES.ACTIONS.MARKETPLACE,
          components: [row],
        });
      } catch {
        const message = await channel.send({
          content: MESSAGES.ACTIONS.MARKETPLACE,
          components: [row],
        });
        this.marketplace_message_id = message.id;
      }
    } else {
      const message = await channel.send({
        content: MESSAGES.ACTIONS.MARKETPLACE,
        components: [row],
      });
      this.marketplace_message_id = message.id;
    }

    this._setup_listeners(channel);
  }

  private _setup_listeners(channel: any): void {
    this.client.on("interactionCreate", async (interaction) => {
      if (interaction.isButton() && interaction.channelId === channel.id) {
        if (interaction.customId === "create_role") {
          await this._show_create_modal(interaction);
        } else if (interaction.customId === "select_role") {
          await this._show_select_modal(interaction);
        }
      } else if (interaction.isModalSubmit()) {
        if (interaction.customId === "create_role_modal") {
          await this._handle_create_modal(interaction);
        } else if (interaction.customId === "select_role_modal") {
          await this._handle_select_modal(interaction);
        }
      }
    });
  }

  private async _show_create_modal(interaction: any): Promise<void> {
    const name_input = new TextInputBuilder()
      .setCustomId("role_name")
      .setLabel("Goal name (max: 15 characters)")
      .setPlaceholder("Enter goal name")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(15)
      .setRequired(true);

    const desc_input = new TextInputBuilder()
      .setCustomId("role_desc")
      .setLabel("Description (5-100 characters)")
      .setPlaceholder("Describe your goal requirement")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(100)
      .setRequired(true);

    const type_input = new TextInputBuilder()
      .setCustomId("role_type")
      .setLabel("Type (text, image, both, or either)")
      .setPlaceholder("Enter: text, image, both, or either")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const fr = new ActionRowBuilder<TextInputBuilder>().addComponents(
      name_input,
    );
    const sr = new ActionRowBuilder<TextInputBuilder>().addComponents(
      desc_input,
    );
    const tr = new ActionRowBuilder<TextInputBuilder>().addComponents(
      type_input,
    );

    const modal = new ModalBuilder()
      .setCustomId("create_role_modal")
      .setTitle("++")
      .addComponents(fr, sr, tr);

    await interaction.showModal(modal);
  }

  private async _handle_create_modal(interaction: any): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const name = interaction.fields.getTextInputValue("role_name");
    const desc = interaction.fields.getTextInputValue("role_desc");
    const type = interaction.fields
      .getTextInputValue("role_type")
      .toLowerCase();

    const validation = await this._validate_role_data(
      name,
      desc,
      type,
      interaction.user.id,
    );
    if (!validation.valid) {
      await interaction.editReply({
        content: `**ERROR**: ${validation.error}.`,
      });
      return;
    }

    await this.create(interaction.user.id, interaction.guild.id, {
      name,
      desc,
      type,
    });
    await interaction.editReply({
      content: `**SUCCESS**: Created role \`${name}\`.`,
    });
  }


  private async _handle_select_modal(interaction: any): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const input = interaction.fields.getTextInputValue("select_roles_input");
    const role_names = input
      .split(",")
      .map((s: any) => s.trim())
      .filter((s: any) => s.length > 0);
    const all_roles = await this._parse_marketplace();
    const role_ids = [];

    for (const name of role_names) {
      const role = all_roles.find(
        (r) => r.name.toLowerCase() === name.toLowerCase(),
      );
      if (role) {
        role_ids.push(role.role_id);
      }
    }

    if (role_ids.length === 0) {
      await interaction.editReply({
        content: `**ERROR**: No valid roles found`,
      });
      return;
    }

    await this.select(interaction.user.id, interaction.guild.id, role_ids);
    await interaction.editReply({
      content: `**SUCCESS**: Added ${role_ids.length} role(s) to you`,
    });
  }

  private async _save_to_marketplace(data: {
    role_id: string;
    name: string;
    desc: string;
    type: string;
    creator: string;
  }): Promise<void> {
    const channel = (await this.client.channels.fetch(
      this.marketplace_channel_id,
    )) as any;
    if (!channel) return;

    const created = new Date().toISOString();
    const content = `\`\`\`\nROLE_ID: ${data.role_id}\nNAME: "${data.name}"\nDESC: "${data.desc}"\nTYPE: "${data.type}"\nCREATOR: ${data.creator}\nCREATED: ${created}\n\`\`\``;

    await channel.send(content);
  }

  private async _parse_marketplace(): Promise<
    Array<{
      role_id: string;
      name: string;
      desc: string;
      type: string;
      creator: string;
      message_id: string;
    }>
  > {
    const channel = (await this.client.channels.fetch(
      this.marketplace_channel_id,
    )) as any;
    if (!channel) return [];

    const messages = await channel.messages.fetch({ limit: 100 });
    const roles = [];

    for (const [message_id, message] of messages) {
      if (message.content.includes("ROLE_ID:")) {
        const lines = message.content.split("\n");
        const role_data = {
          role_id: lines[1].split(": ")[1],
          name: lines[2].split(": ")[1].replace(/"/g, ""),
          desc: lines[3].split(": ")[1].replace(/"/g, ""),
          type: lines[4].split(": ")[1].replace(/"/g, ""),
          creator: lines[5].split(": ")[1],
          message_id: message_id,
        };
        roles.push(role_data);
      }
    }

    return roles;
  }


  private async _get_user_roles(user_id: string): Promise<
    Array<{
      role_id: string;
      name: string;
      desc: string;
      type: string;
    }>
  > {
    const all_roles = await this._parse_marketplace();
    return all_roles.filter((role) => role.creator === user_id);
  }

  private async _validate_role_data(
    name: string,
    desc: string,
    type: string,
    user_id: string,
  ): Promise<{ valid: boolean; error?: string }> {
    if (name.length < 2 || name.length > 15) {
      return { valid: false, error: "Name must be 2-15 characters" };
    }

    if (desc.length < 5 || desc.length > 100) {
      return { valid: false, error: "Description must be 5-100 characters" };
    }

    if (!["text", "image", "both", "either"].includes(type)) {
      return {
        valid: false,
        error: "Type must be: text, image, both, or either",
      };
    }

    const existing_roles = await this._parse_marketplace();
    if (
      existing_roles.some((r) => r.name.toLowerCase() === name.toLowerCase())
    ) {
      return { valid: false, error: "Role name already exists" };
    }

    return { valid: true };
  }


  private async _show_select_modal(interaction: any): Promise<void> {
    const all_roles = await this._parse_marketplace();

    if (all_roles.length === 0) {
      await interaction.reply({
        content: "**ERROR**: No roles available to select.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId("select_role_modal")
      .setTitle("Select roles");

    const selectInput = new TextInputBuilder()
      .setCustomId("select_roles_input")
      .setLabel(
        `Join a role, separated by commas: ${all_roles.map((r) => r.name).join(", ")}`,
      )
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Enter role names separated by commas")
      .setRequired(true);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
      selectInput,
    );
    modal.addComponents(row);

    await interaction.showModal(modal);
  }
}

const Roles = new Controller({
  client: discord_client,
  marketplace_channel_id: process.env.MARKETPLACE_CHANNEL_ID || "",
  marketplace_message_id: process.env.MARKETPLACE_MESSAGE_ID || "",
});

export { Roles };
