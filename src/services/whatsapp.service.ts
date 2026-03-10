/// <reference lib="dom" />
import fs from 'node:fs';
import path from 'node:path';
import type { Channel, Client as ClientType } from 'whatsapp-web.js';
import pkg from 'whatsapp-web.js';
import { config } from '../config/index.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('WhatsAppService');
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

// ─── Stale lock file cleanup ─────────────────────────────────────────────────
// When the container stops abruptly, Chromium leaves lock files (SingletonLock,
// SingletonCookie, SingletonSocket) in the user-data directory. These cause
// "already running" errors on the next start. We clean them before init.

const CHROMIUM_LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

function cleanupStaleLocks(sessionDataPath: string): void {
  try {
    // LocalAuth stores session under <dataPath>/session-<clientId>/Default/
    // Walk the session directory tree looking for lock files
    if (!fs.existsSync(sessionDataPath)) return;

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (CHROMIUM_LOCK_FILES.includes(entry.name)) {
          try {
            fs.unlinkSync(fullPath);
            logger.info({ file: fullPath }, 'Removed stale Chromium lock file');
          } catch (err) {
            logger.warn(
              { file: fullPath, error: (err as Error).message },
              'Failed to remove lock file'
            );
          }
        }
      }
    };

    walk(sessionDataPath);
  } catch (err) {
    logger.warn({ error: (err as Error).message }, 'Lock file cleanup failed');
  }
}

// ─── Initialization ──────────────────────────────────────────────────────────

export async function initWhatsApp(): Promise<void> {
  if (isInitializing || isReady) return;
  isInitializing = true;

  // Clean stale Chromium lock files from previous container lifecycle
  cleanupStaleLocks(config.whatsapp.sessionDataPath);

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
    logger.error({ error: msg }, 'WhatsApp authentication failed — cleaning session and retrying');

    // Clear the session data so the next init gets a fresh QR code
    const sessionPath = config.whatsapp.sessionDataPath;
    try {
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        logger.info({ path: sessionPath }, 'Cleared stale WhatsApp session data');
      }
    } catch (err) {
      logger.warn({ error: (err as Error).message }, 'Failed to clear session data');
    }

    // Retry initialization after a short delay
    client = undefined;
    setTimeout(() => {
      void initWhatsApp();
    }, 5000);
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

interface RawChannelInfo {
  id: { _serialized: string };
  name: string;
}

async function getRawChannels(): Promise<RawChannelInfo[]> {
  if (!client || !isReady) return [];

  try {
    // Access raw channel data via Puppeteer, bypassing the buggy Channel._patch constructor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pupPage = (client as any).pupPage;
    const rawChannels: Array<{ id: { _serialized: string }; name?: string }> =
      await pupPage.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channels = await (window as any).WWebJS.getChannels();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return channels.map((ch: any) => ({
          id: { _serialized: ch.id._serialized },
          name: ch.name,
        }));
      });
    return rawChannels.map(ch => ({
      id: { _serialized: ch.id._serialized },
      name: ch.name ?? '(unnamed)',
    }));
  } catch (err) {
    logger.warn({ error: (err as Error).message }, 'Raw channel discovery via pupPage failed');
    return [];
  }
}

async function getSafeChannels(): Promise<Channel[]> {
  if (!client || !isReady) return [];

  try {
    return await client.getChannels();
  } catch (err) {
    logger.warn(
      { error: (err as Error).message },
      'getChannels() failed — will use raw channel data for listing'
    );
    return [];
  }
}

// ─── Low-level newsletter send via Puppeteer ────────────────────────────────
// Bypasses whatsapp-web.js's buggy channel.sendMessage() which fails with
// "getLastMsgKeyForAction is not a function" on newsletter channels.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPupPage(): any | undefined {
  if (!client || !isReady) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as any).pupPage;
}

async function sendTextToNewsletter(channelId: string, text: string): Promise<void> {
  const pupPage = getPupPage();
  if (!pupPage) throw new Error('WhatsApp client is not ready');

  const success = await pupPage.evaluate(
    async (chatId: string, body: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const W = window as any;
      const chatWid = W.Store.WidFactory.createWid(chatId);

      // Load the newsletter chat model
      let chat = W.Store.WAWebNewsletterMetadataCollection.get(chatId);
      if (!chat) {
        await W.Store.ChannelUtils.loadNewsletterPreviewChat(chatId);
        chat = await W.Store.WAWebNewsletterMetadataCollection.find(chatWid);
      }
      if (!chat) return false;

      // Build message model
      const meUser = W.Store.User.getMaybeMePnUser();
      const newId = await W.Store.MsgKey.newId();
      const newMsgKey = new W.Store.MsgKey({
        from: meUser,
        to: chat.id,
        id: newId,
        selfDir: 'out',
      });

      const message = {
        id: newMsgKey,
        ack: 0,
        body,
        from: meUser,
        to: chat.id,
        local: true,
        self: 'out',
        t: Math.floor(Date.now() / 1000),
        isNewMsg: true,
        type: 'chat',
      };

      const msg = new W.Store.Msg.modelClass(message);
      const msgData = W.Store.SendChannelMessage.msgDataFromMsgModel(msg);
      await W.Store.SendChannelMessage.addNewsletterMsgsRecords([msgData]);

      await W.Store.SendChannelMessage.sendNewsletterMessageJob({
        msg,
        type: 'text',
        newsletterJid: chat.id.toJid(),
      });

      return true;
    },
    channelId,
    text
  );

  if (!success) throw new Error('Newsletter chat model not found in browser');
}

async function sendMediaToNewsletter(
  channelId: string,
  base64Data: string,
  mimetype: string,
  caption: string,
  filename: string
): Promise<void> {
  const pupPage = getPupPage();
  if (!pupPage) throw new Error('WhatsApp client is not ready');

  const success = await pupPage.evaluate(
    async (chatId: string, b64: string, mime: string, cap: string, fname: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const W = window as any;
      const chatWid = W.Store.WidFactory.createWid(chatId);

      let chat = W.Store.WAWebNewsletterMetadataCollection.get(chatId);
      if (!chat) {
        await W.Store.ChannelUtils.loadNewsletterPreviewChat(chatId);
        chat = await W.Store.WAWebNewsletterMetadataCollection.find(chatWid);
      }
      if (!chat) return false;

      // Process media
      const mediaData = await W.WWebJS.processMediaData(
        { data: b64, mimetype: mime, filename: fname },
        { sendToChannel: true }
      );

      const meUser = W.Store.User.getMaybeMePnUser();
      const newId = await W.Store.MsgKey.newId();
      const newMsgKey = new W.Store.MsgKey({
        from: meUser,
        to: chat.id,
        id: newId,
        selfDir: 'out',
      });

      const message = {
        id: newMsgKey,
        ack: 0,
        body: mediaData.preview,
        from: meUser,
        to: chat.id,
        local: true,
        self: 'out',
        t: Math.floor(Date.now() / 1000),
        isNewMsg: true,
        type: 'chat',
        caption: cap,
        ...mediaData,
        ...(mediaData.toJSON ? mediaData.toJSON() : {}),
      };

      const msg = new W.Store.Msg.modelClass(message);
      const msgData = W.Store.SendChannelMessage.msgDataFromMsgModel(msg);
      await W.Store.SendChannelMessage.addNewsletterMsgsRecords([msgData]);

      await W.Store.SendChannelMessage.sendNewsletterMessageJob({
        msg,
        type: 'media',
        newsletterJid: chat.id.toJid(),
        mediaMetadata: msg.avParams(),
        mediaHandle: mediaData.mediaHandle ?? null,
      });

      return true;
    },
    channelId,
    base64Data,
    mimetype,
    caption,
    filename
  );

  if (!success) throw new Error('Newsletter chat model not found in browser');
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

  const { channelId } = config.whatsapp;
  if (!channelId) {
    return { success: false, error: 'WHATSAPP_CHANNEL_ID not configured' };
  }

  try {
    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      await sendMediaToNewsletter(
        channelId,
        media.data,
        media.mimetype,
        text,
        media.filename ?? 'image.jpg'
      );
    } else {
      await sendTextToNewsletter(channelId, text);
    }

    logger.info({ channelId }, 'Published to WhatsApp channel');
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

  const { channelId } = config.whatsapp;
  if (!channelId) {
    return { success: false, error: 'WHATSAPP_CHANNEL_ID not configured' };
  }

  try {
    const base64 = imageBuffer.toString('base64');
    await sendMediaToNewsletter(channelId, base64, mimetype, text, 'top5.png');

    logger.info({ channelId }, 'Published buffer image to WhatsApp channel');
    return { success: true };
  } catch (err) {
    const msg = (err as Error).message;
    logger.error({ error: msg }, 'WhatsApp channel buffer publish failed');
    return { success: false, error: msg };
  }
}

export async function listChannels(): Promise<Array<{ id: string; name: string }>> {
  if (!isReady || !client) return [];

  // Use raw Puppeteer-level data to avoid Channel._patch crash
  const rawChannels = await getRawChannels();
  if (rawChannels.length > 0) {
    return rawChannels.map(ch => ({ id: ch.id._serialized, name: ch.name }));
  }

  // Last resort: try the safe wrapper (works if the bug is fixed in future versions)
  const channels = await getSafeChannels();
  return channels
    .map(ch => {
      try {
        return { id: ch.id._serialized, name: ch.name ?? '(unnamed)' };
      } catch {
        return { id: 'unknown', name: '(broken)' };
      }
    })
    .filter(ch => ch.id !== 'unknown');
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
