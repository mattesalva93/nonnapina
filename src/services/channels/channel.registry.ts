import { config } from '../../config/index.js';
import { createComponentLogger } from '../../utils/logger.js';
import { sendErrorAlert } from '../email.service.js';
import { prisma } from '../product.service.js';
import { getWhatsAppStatus } from '../whatsapp.service.js';
import type {
  BufferChannelDef,
  ChannelDef,
  ChannelPayload,
  ChannelResult,
} from './channel.types.js';
import { publishToTelegram } from './telegram.channel.js';
import { publishToWhatsApp } from './whatsapp.channel.js';

const logger = createComponentLogger('ChannelRegistry');

export function getActiveChannels(): ChannelDef[] {
  const channels: ChannelDef[] = [];

  if (config.telegram.botToken && config.telegram.chatId) {
    channels.push({ name: 'TELEGRAM', send: publishToTelegram });
  }

  if (config.whatsapp.channelId) {
    channels.push({ name: 'WHATSAPP', send: publishToWhatsApp });
  }

  return channels;
}

/**
 * Checks whether every configured channel is currently operational.
 * If WhatsApp is configured but not ready, returns false.
 */
export function areAllChannelsReady(): { ready: boolean; reason?: string } {
  if (config.whatsapp.channelId) {
    const waStatus = getWhatsAppStatus();
    if (waStatus.status !== 'ready') {
      return { ready: false, reason: `WhatsApp is ${waStatus.status}` };
    }
  }
  return { ready: true };
}

export async function dispatchToChannels(
  channels: ChannelDef[],
  payload: ChannelPayload
): Promise<ChannelResult[]> {
  const results: ChannelResult[] = [];
  for (const channel of channels) {
    try {
      const result = await channel.send(payload);
      results.push(result);
    } catch (err) {
      results.push({
        channel: channel.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

export async function dispatchToBufferChannels(
  channels: BufferChannelDef[]
): Promise<ChannelResult[]> {
  const results: ChannelResult[] = [];
  for (const channel of channels) {
    try {
      const result = await channel.send();
      results.push(result);
    } catch (err) {
      results.push({
        channel: channel.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

export async function recordPublications(
  dealId: string,
  postContent: string,
  results: ChannelResult[]
): Promise<void> {
  for (const result of results) {
    await prisma.publication.create({
      data: {
        dealId,
        channel: result.channel,
        postContent,
        success: result.success,
      },
    });
  }
}

export async function markDealPublished(
  dealId: string,
  asin: string,
  results: ChannelResult[],
  component: string
): Promise<{ anySucceeded: boolean; allSucceeded: boolean }> {
  const anySucceeded = results.some(r => r.success);
  const allSucceeded = results.every(r => r.success);

  if (anySucceeded) {
    await prisma.deal.update({
      where: { id: dealId },
      data: { published: true },
    });
    logger.info({ dealId, asin }, 'Deal marked as published');
  }

  if (!allSucceeded) {
    const failedChannels = results.filter(r => !r.success);
    logger.warn(
      { dealId, failures: failedChannels.map(r => r.channel) },
      'Some channels failed during publish'
    );
    for (const failure of failedChannels) {
      void sendErrorAlert({
        errorMessage: `Publish failed on channel ${failure.channel}: ${failure.error ?? 'Unknown error'}`,
        component,
        severity: 'error',
        additionalData: { dealId, asin, channel: failure.channel },
      });
    }
  }

  return { anySucceeded, allSucceeded };
}
