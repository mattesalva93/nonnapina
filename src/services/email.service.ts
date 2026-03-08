import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { localISOString } from '../utils/date.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ErrorAlertPayload {
  errorMessage: string;
  errorStack?: string;
  component: string;
  severity: 'critical' | 'error' | 'warning';
  scrapeRunId?: string;
  endpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  additionalData?: Record<string, unknown>;
}

// ─── Transporter (lazy singleton) ─────────────────────────────────────────────

let transporter: Transporter | undefined;

function getTransporter(): Transporter | undefined {
  if (transporter) return transporter;

  const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = config.email;
  if (!smtpHost || !smtpUser || !smtpPass) return undefined;

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: { user: smtpUser, pass: smtpPass },
  });

  return transporter;
}

// ─── Email alert guard ────────────────────────────────────────────────────────

function isEmailAlertEnabled(): boolean {
  return config.server.nodeEnv === 'production' && Boolean(config.email.alertTo);
}

// ─── HTML template ────────────────────────────────────────────────────────────

function buildAlertHtml(payload: ErrorAlertPayload): string {
  const timestamp = localISOString();
  const rows: Array<[string, string]> = [
    ['Timestamp', timestamp],
    ['Environment', config.server.nodeEnv],
    ['Severity', payload.severity.toUpperCase()],
    ['Component', payload.component],
  ];

  if (payload.scrapeRunId) rows.push(['Scrape Run ID', payload.scrapeRunId]);
  if (payload.endpoint) rows.push(['Endpoint', payload.endpoint]);
  if (payload.httpMethod) rows.push(['HTTP Method', payload.httpMethod]);
  if (payload.httpStatus !== undefined) rows.push(['HTTP Status', String(payload.httpStatus)]);

  rows.push(['Error Message', payload.errorMessage]);

  if (payload.additionalData) {
    for (const [key, value] of Object.entries(payload.additionalData)) {
      rows.push([key, typeof value === 'string' ? value : JSON.stringify(value)]);
    }
  }

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:10px 14px;border:1px solid #ddd;background-color:#f8f9fa;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:10px 14px;border:1px solid #ddd;word-break:break-word;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('\n');

  const stackSection = payload.errorStack
    ? `<h3 style="color:#333;margin-top:24px;">Stack Trace</h3>
       <pre style="background:#f5f5f5;padding:14px;border-radius:4px;overflow-x:auto;font-size:12px;line-height:1.5;border:1px solid #ddd;">${escapeHtml(payload.errorStack)}</pre>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;background-color:#f4f4f7;color:#333;">
  <div style="max-width:640px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background-color:${severityColor(payload.severity)};padding:20px 24px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">Keepa Tracker — Error Alert</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">${escapeHtml(payload.severity.toUpperCase())} in ${escapeHtml(payload.component)}</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${tableRows}
      </table>
      ${stackSection}
    </div>
    <div style="padding:16px 24px;background:#f8f9fa;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
      Keepa Tracker v${process.env.npm_package_version ?? '0.1.0'} &middot; ${timestamp}
    </div>
  </div>
</body>
</html>`;
}

function severityColor(severity: ErrorAlertPayload['severity']): string {
  switch (severity) {
    case 'critical':
      return '#c0392b';
    case 'error':
      return '#e74c3c';
    case 'warning':
      return '#e67e22';
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Send alert ───────────────────────────────────────────────────────────────

export async function sendErrorAlert(payload: ErrorAlertPayload): Promise<boolean> {
  if (!isEmailAlertEnabled()) return false;

  const transport = getTransporter();
  if (!transport) return false;

  const { alertFrom, alertTo, alertCc } = config.email;
  const subject = `[${payload.severity.toUpperCase()}] ${payload.errorMessage.slice(0, 150)}`;

  try {
    await transport.sendMail({
      from: alertFrom,
      to: alertTo,
      cc: alertCc.length > 0 ? alertCc : undefined,
      subject,
      html: buildAlertHtml(payload),
    });
    return true;
  } catch {
    // Avoid infinite loops — do not throw or try to alert about alert failures.
    // The pino logger in the calling code will capture the original error.
    return false;
  }
}
