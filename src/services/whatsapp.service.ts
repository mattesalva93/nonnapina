import type { Channel, Client as ClientType } from 'whatsapp-web.js';
import pkg from 'whatsapp-web.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const { Client, LocalAuth, MessageMedia } = pkg;

// ─── State ───────────────────────────────────────────────────────────────────
let client: ClientType | undefined;
let qrCode: string | undefined;
let isReady = false;
let isInitializing = false;

type WhatsAppStatus = 'disconnected' | 'initializing' | 'qr_pending' | 'ready';

export function getWhatsAppStatus(): { status: WhatsAppStatus; qr: string | undefined } {
  if (isReady) return { status: 'ready', qr: undefined };
  if (qrCode) return { status: 'qr_pending', qr: qrCode };
  if (isInitializing) return { status: 'initializing', qr: undefined };
  return { status: 'disconnected', qr: undefined };
}

// ─── Initialization ──────────────────────────────────────────────────────────

export async function initWhatsApp(): Promise<void> {
  if (isInitializing || isReady) return;
  isInitializing = true;

  const chromiumPath = process.env.CHROMIUM_PATH;

  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: config.whatsapp.sessionDataPath,
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    },
  });

  client.on('qr', (qr: string) => {
    qrCode = qr;
    logger.info('WhatsApp QR code received — scan via GET /api/whatsapp/qr');
  });

  client.on('ready', () => {
    isReady = true;
    isInitializing = false;
    qrCode = undefined;
    logger.info('WhatsApp client is ready');
  });

  client.on('authenticated', () => {
    logger.info('WhatsApp session authenticated');
  });

  client.on('auth_failure', (msg: string) => {
    isReady = false;
    isInitializing = false;
    logger.error({ error: msg }, 'WhatsApp authentication failed');
  });

  client.on('disconnected', (reason: string) => {
    isReady = false;
    isInitializing = false;
    qrCode = undefined;
    logger.warn({ reason }, 'WhatsApp client disconnected');
  });

  try {
    await client.initialize();
  } catch (err) {
    isInitializing = false;
    logger.error({ err: (err as Error).message }, 'WhatsApp client initialization failed');
  }
}

// ─── Channel helpers ─────────────────────────────────────────────────────────

async function getChannel(): Promise<Channel | undefined> {
  if (!client || !isReady) return undefined;

  const { channelId } = config.whatsapp;
  if (!channelId) return undefined;

  const channels = await client.getChannels();
  return channels.find((ch: Channel) => ch.id._serialized === channelId || ch.name === channelId);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface WhatsAppSendResult {
  success: boolean;
  error?: string;
}

export async function sendToWhatsAppChannel(
  text: string,
  imageUrl: string | undefined
): Promise<WhatsAppSendResult> {
  if (!isReady || !client) {
    return { success: false, error: 'WhatsApp client is not ready' };
  }

  const channel = await getChannel();
  if (!channel) {
    return { success: false, error: 'WhatsApp channel not found — check WHATSAPP_CHANNEL_ID' };
  }

  try {
    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      await channel.sendMessage(media, { caption: text });
    } else {
      await channel.sendMessage(text);
    }

    logger.info(
      { channel: channel.name, channelId: channel.id._serialized },
      'Published to WhatsApp channel'
    );
    return { success: true };
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ error: msg }, 'WhatsApp channel publish failed');
    return { success: false, error: msg };
  }
}

export async function sendBufferToWhatsAppChannel(
  text: string,
  imageBuffer: Buffer,
  mimetype: string = 'image/png'
): Promise<WhatsAppSendResult> {
  if (!isReady || !client) {
    return { success: false, error: 'WhatsApp client is not ready' };
  }

  const channel = await getChannel();
  if (!channel) {
    return { success: false, error: 'WhatsApp channel not found — check WHATSAPP_CHANNEL_ID' };
  }

  try {
    const media = new MessageMedia(mimetype, imageBuffer.toString('base64'), 'top5.png');
    await channel.sendMessage(media, { caption: text });

    logger.info(
      { channel: channel.name, channelId: channel.id._serialized },
      'Published buffer image to WhatsApp channel'
    );
    return { success: true };
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ error: msg }, 'WhatsApp channel buffer publish failed');
    return { success: false, error: msg };
  }
}

export async function listChannels(): Promise<Array<{ id: string; name: string }>> {
  if (!isReady || !client) return [];
  const channels = await client.getChannels();
  return channels.map((ch: Channel) => ({ id: ch.id._serialized, name: ch.name }));
}

export async function destroyWhatsApp(): Promise<void> {
  if (client) {
    try {
      await client.destroy();
    } catch {
      // Ignore destroy errors during shutdown
    }
    client = undefined;
    isReady = false;
    isInitializing = false;
    qrCode = undefined;
  }
}
