import { escapeHtml } from '../../common/utils/escape-html';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

interface LayoutOptions {
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** The user's own words (e.g. a reminder message), set apart under the paragraphs. */
  quote?: string;
  /** Label/value rows, e.g. a task's due date and status. */
  details?: Array<{ label: string; value: string }>;
  /** Linked rows, e.g. the tasks in a daily summary. */
  items?: Array<{ title: string; meta: string; url: string; urgent?: boolean }>;
  button?: { label: string; url: string };
  /** A one-time code shown large, between the paragraphs and the footnote. */
  code?: string;
  footnote?: string;
  /** Replaces the generic footer for optional notifications. */
  unsubscribe?: { reason: string; url: string; settingsUrl: string };
}

/**
 * Renders a light-themed email with inline styles (email clients ignore most CSS).
 * Every value is treated as plain text and HTML-escaped.
 */
export function renderEmail(options: LayoutOptions): string {
  const paragraphs = options.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4A4E6A;">${escapeHtml(text)}</p>`,
    )
    .join('');

  const quote = options.quote
    ? `<p style="margin:0 0 18px;padding:12px 16px;font-size:15px;line-height:1.6;color:#1B1C3A;background:#F0F1F9;border-left:3px solid #5B5BF0;border-radius:6px;white-space:pre-line;">${escapeHtml(options.quote)}</p>`
    : '';

  const details = options.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border-top:1px solid #E3E5F0;">${options.details
        .map(
          (row) =>
            `<tr><td style="padding:9px 0;border-bottom:1px solid #E3E5F0;font-size:13.5px;color:#858AA6;width:38%;">${escapeHtml(row.label)}</td><td style="padding:9px 0;border-bottom:1px solid #E3E5F0;font-size:14px;font-weight:700;color:#1B1C3A;">${escapeHtml(row.value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  const items = options.items?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border-top:1px solid #E3E5F0;">${options.items
        .map(
          (item) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid #E3E5F0;"><a href="${escapeHtml(item.url)}" style="font-size:14.5px;font-weight:700;color:#1B1C3A;text-decoration:none;">${escapeHtml(item.title)}</a><div style="margin-top:2px;font-size:13px;color:${item.urgent ? '#D6334F' : '#858AA6'};">${escapeHtml(item.meta)}</div></td></tr>`,
        )
        .join('')}</table>`
    : '';

  const footer = options.unsubscribe
    ? `${escapeHtml(options.unsubscribe.reason)} <a href="${escapeHtml(options.unsubscribe.url)}" style="color:#858AA6;">Unsubscribe</a> · <a href="${escapeHtml(options.unsubscribe.settingsUrl)}" style="color:#858AA6;">Notification settings</a>`
    : 'You received this email because of activity on your TaskFlow account.';

  const button = options.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 22px;"><tr><td style="border-radius:12px;background:#5B5BF0;">
<a href="${escapeHtml(options.button.url)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">${escapeHtml(options.button.label)}</a>
</td></tr></table>`
    : '';

  const code = options.code
    ? `<p style="margin:6px 0 22px;padding:16px 0;text-align:center;font-size:32px;font-weight:800;letter-spacing:10px;color:#1B1C3A;background:#F0F1F9;border-radius:14px;font-family:'Courier New',monospace;">${escapeHtml(options.code)}</p>`
    : '';

  const footnote = options.footnote
    ? `<p style="margin:0;font-size:12.5px;line-height:1.6;color:#858AA6;">${escapeHtml(options.footnote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.heading)}</title></head>
<body style="margin:0;padding:0;background:#F3F4FC;font-family:'Plus Jakarta Sans','Segoe UI',Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F4FC;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;padding:32px;">
<tr><td>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:22px;"><tr>
<td style="width:30px;height:30px;border-radius:9px;background:#5B5BF0;"></td>
<td style="padding-left:10px;font-size:17px;font-weight:800;color:#1B1C3A;">TaskFlow</td>
</tr></table>
<h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;color:#1B1C3A;">${escapeHtml(options.heading)}</h1>
${paragraphs}
${quote}
${details}
${items}
${code}
${button}
${footnote}
</td></tr>
</table>
<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#858AA6;">${footer}</p>
</td></tr>
</table>
</body>
</html>`;
}
