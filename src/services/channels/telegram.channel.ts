import axios from 'axios';
import { config } from '../../config/index.js';
import { createComponentLogger } from '../../utils/logger.js';
import type { ChannelPayload, ChannelResult } from './channel.types.js';

const logger = createComponentLogger('TelegramChannel');

export const TELEGRAM_CAPTION_LIMIT = 1024;

export async function publishToTelegram(payload: ChannelPayload): Promise<ChannelResult> {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    return {
      channel: 'TELEGRAM',
      success: false,
      error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured',
    };
  }

  const baseUrl = `https://api.telegram.org/bot${botToken}`;
  const { postContent, imageUrl } = payload;

  try {
    if (imageUrl && postContent.length <= TELEGRAM_CAPTION_LIMIT) {
      await axios.post(
        `${baseUrl}/sendPhoto`,
        { chat_id: chatId, photo: imageUrl, caption: postContent },
        { timeout: 15_000 }
      );
    } else if (imageUrl) {
      await axios.post(
        `${baseUrl}/sendPhoto`,
        { chat_id: chatId, photo: imageUrl },
        { timeout: 15_000 }
      );
      await axios.post(
        `${baseUrl}/sendMessage`,
        { chat_id: chatId, text: postContent, disable_web_page_preview: true },
        { timeout: 15_000 }
      );
    } else {
      await axios.post(
        `${baseUrl}/sendMessage`,
        { chat_id: chatId, text: postContent, disable_web_page_preview: true },
        { timeout: 15_000 }
      );
    }

    logger.info({ channel: 'TELEGRAM', chatId }, 'Published to Telegram');
    return { channel: 'TELEGRAM', success: true };
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? (err.response?.data?.description ?? err.message)
      : (err as Error).message;
    logger.error({ channel: 'TELEGRAM', error: msg }, 'Telegram publish failed');
    return { channel: 'TELEGRAM', success: false, error: String(msg) };
  }
}

export async function publishBufferToTelegram(
  postContent: string,
  imageBuffer: Buffer | undefined
): Promise<ChannelResult> {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    return { channel: 'TELEGRAM', success: false, error: 'Telegram not configured' };
  }

  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  try {
    if (imageBuffer) {
      const form = new FormData();
      form.set('chat_id', chatId);
      form.set('photo', new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' }), 'top5.png');
      if (postContent.length <= TELEGRAM_CAPTION_LIMIT) {
        form.set('caption', postContent);
      }

      const response = await fetch(`${baseUrl}/sendPhoto`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const body = (await response.json()) as { description?: string };
        throw new Error(body.description ?? `HTTP ${response.status}`);
      }

      if (postContent.length > TELEGRAM_CAPTION_LIMIT) {
        await axios.post(
          `${baseUrl}/sendMessage`,
          { chat_id: chatId, text: postContent, disable_web_page_preview: true },
          { timeout: 15_000 }
        );
      }
    } else {
      await axios.post(
        `${baseUrl}/sendMessage`,
        { chat_id: chatId, text: postContent, disable_web_page_preview: true },
        { timeout: 15_000 }
      );
    }

    logger.info({ channel: 'TELEGRAM' }, 'Published to Telegram (buffer)');
    return { channel: 'TELEGRAM', success: true };
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? (err.response?.data?.description ?? err.message)
      : (err as Error).message;
    logger.error({ channel: 'TELEGRAM', error: msg }, 'Telegram publish failed');
    return { channel: 'TELEGRAM', success: false, error: String(msg) };
  }
}
