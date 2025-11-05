import { GuildMember, EmbedBuilder, Message, Attachment, Client } from "discord.js";
import { logger } from "@/lib/logger";
import { Roles } from "@/bot/controller";
import { colors } from "@/constants/colors";

interface Options {
}

interface Structure {
  create_entry_embeds(member: GuildMember): Promise<EmbedBuilder[]>;
  handle_reply(message: Message, client: Client): Promise<void>;
}

class EntryService implements Structure {
  constructor(options: Options) {
    if (options === null || Object.keys(options).length !== 0) {
      logger.fatal("DEV: EntryService was not instantiated correctly.");
    }
  }

  private async _get_user_entry_types(member: GuildMember) {
    const marketplace_roles = await Roles._parse_marketplace();
    const user_role_ids = member.roles.cache.map(r => r.id);

    const user_roles = marketplace_roles.filter(role =>
      user_role_ids.includes(role.role_id)
    );

    return user_roles;
  }

  private async _create_entry_embeds(member: GuildMember) {
    const user_roles = await this._get_user_entry_types(member);
    const embeds = [];

    for (const role of user_roles) {
      const discord_role = member.roles.cache.get(role.role_id);
      const color_keys = Object.keys(colors);
      const random_color = parseInt(color_keys[Math.floor(Math.random() * color_keys.length)]!);
      const color = discord_role?.color || random_color;

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`✳ ${role.name}`)
        .setDescription(`☰ ${role.desc}`);

      const requirement_text = this._get_requirement_text(role.type);
      embed.addFields({ name: '', value: `⇥ __${requirement_text}__`, inline: false });

      embeds.push(embed);
    }

    return embeds;
  }

  private _get_requirement_text(type: string): string {
    switch (type) {
      case 'text':
        return 'Requires text only.';
      case 'image':
        return 'Requires image only.';
      case 'both':
        return 'Requires both text and image.';
      case 'either':
        return 'Requires image or text.';
      default:
        return 'Requires submission.';
    }
  }

  async create_entry_embeds(member: GuildMember): Promise<EmbedBuilder[]> {
    return await this._create_entry_embeds(member);
  }

  async handle_reply(message: Message, client: Client): Promise<void> {
    if (!message.reference) return;

    const referenced_message = await message.fetchReference();
    if (!referenced_message.embeds.length) return;

    const embed = referenced_message.embeds[0];
    if (embed!.title?.startsWith('~~')) return;

    const field_value = embed!.fields[0]?.value;
    if (!field_value) return;

    const required_type = this._parse_required_type(field_value);
    const is_valid = this._validate_entry_content(message, required_type);

    if (!is_valid) {
      await message.reply({ content: 'Invalid entry format. Please check the requirements.' });
      return;
    }

    const updated_embed = EmbedBuilder.from(embed!)
      .setTitle(`~~${embed!.title}~~`);

    await referenced_message.edit({ embeds: [updated_embed] });
    await message.react('✅');

    this._check_all_entries_complete(message.channelId, client);
  }

  private _parse_required_type(field_value: string): string {
    if (field_value.includes('text only')) return 'text';
    if (field_value.includes('image only')) return 'image';
    if (field_value.includes('both text and image')) return 'both';
    if (field_value.includes('image or text')) return 'either';
    return 'either';
  }

  private _validate_entry_content(message: Message, required_type: string): boolean {
    const has_text = message.content.trim().length > 0;
    const has_image = message.attachments.some((a: Attachment) => a.contentType?.startsWith('image/'));

    switch (required_type) {
      case 'text':
        return has_text && !has_image;
      case 'image':
        return has_image && !has_text;
      case 'both':
        return has_text && has_image;
      case 'either':
        return has_text || has_image;
      default:
        return false;
    }
  }

  private async _check_all_entries_complete(channel_id: string, client: Client) {
    const channel = await client.channels.fetch(channel_id);
    if (!channel || !channel.isThread()) return;

    const messages = await channel.messages.fetch({ limit: 100 });
    const embed_messages = messages.filter(m => m.embeds.length > 0 && m.author.bot);

    let all_complete = true;
    for (const [, message] of embed_messages) {
      const embed = message.embeds[0];
      if (!embed!.title?.startsWith('~~')) {
        all_complete = false;
        break;
      }
    }

    if (all_complete) {
      await this._archive_thread(channel);
    }
  }

  private async _archive_thread(thread: any) {
    const thread_name = thread.name;
    await thread.setName(`archive-${thread_name}`);
    await thread.setLocked(true);
    await thread.setArchived(true);
  }
}

const entry_service = new EntryService({});

export { entry_service };
