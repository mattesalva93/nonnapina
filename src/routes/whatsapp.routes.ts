import { Router } from 'express';
import { getWhatsAppStatus, listChannels } from '../services/whatsapp.service.js';
import { createComponentLogger } from '../utils/logger.js';

const logger = createComponentLogger('WhatsAppRoutes');
export const whatsappRouter = Router();

// GET /api/whatsapp/status — Current connection state
whatsappRouter.get('/status', (_req, res) => {
  const status = getWhatsAppStatus();
  logger.debug({ status: status.status }, 'WhatsApp status queried');
  res.json(status);
});

// GET /api/whatsapp/qr — QR code for initial authentication
// Returns a page with an auto-refreshing QR code rendered as text
whatsappRouter.get('/qr', (_req, res) => {
  const { status, qr } = getWhatsAppStatus();

  if (status === 'ready') {
    res.json({ message: 'WhatsApp is already authenticated — no QR needed' });
    return;
  }

  if (!qr) {
    res.json({
      message: 'QR code not yet available — client is initializing, try again in a few seconds',
      status,
    });
    return;
  }

  // Return raw QR string for the client to render (e.g. via qrcode-terminal or a frontend lib)
  res.json({ qr, status });
});

// GET /api/whatsapp/channels — List all channels visible to the authenticated account
whatsappRouter.get('/channels', async (_req, res, next) => {
  try {
    const channels = await listChannels();
    res.json({ channels });
  } catch (err) {
    next(err);
  }
});
