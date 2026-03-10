import { createComponentLogger } from '../../utils/logger.js';
import { sendBufferToWhatsAppChannel, sendToWhatsAppChannel } from '../whatsapp.service.js';
import type { ChannelPayload, ChannelResult } from './channel.types.js';

const logger = createComponentLogger('WhatsAppChannel');

export async function publishToWhatsApp(payload: ChannelPayload): Promise<ChannelResult> {
  const result = await sendToWhatsAppChannel(payload.postContent, payload.imageUrl);
  if (!result.success) {
    logger.error({ channel: 'WHATSAPP', error: result.error }, 'WhatsApp publish failed');
  }
  return { channel: 'WHATSAPP', success: result.success, error: result.error };
}

export async function publishBufferToWhatsApp(
  postContent: string,
  imageBuffer: Buffer | undefined
): Promise<ChannelResult> {
  const result = imageBuffer
    ? await sendBufferToWhatsAppChannel(postContent, imageBuffer)
    : await sendToWhatsAppChannel(postContent, undefined);

  if (!result.success) {
    logger.error({ channel: 'WHATSAPP', error: result.error }, 'WhatsApp publish failed');
  }
  return { channel: 'WHATSAPP', success: result.success, error: result.error };
}
