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
  button?: { label: string; url: string };
  footnote?: string;
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

  const button = options.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 22px;"><tr><td style="border-radius:12px;background:#5B5BF0;">
<a href="${escapeHtml(options.button.url)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;">${escapeHtml(options.button.label)}</a>
</td></tr></table>`
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
${button}
${footnote}
</td></tr>
</table>
<p style="margin:18px 0 0;font-size:12px;color:#858AA6;">You received this email because of activity on your TaskFlow account.</p>
</td></tr>
</table>
</body>
</html>`;
}
