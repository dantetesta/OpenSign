const RESEND_SEND_EMAIL_URL = 'https://api.resend.com/emails';

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

export function defaultSenderEmail(fallback) {
  return isResendConfigured() ? process.env.RESEND_FROM_EMAIL.trim() : fallback;
}

function resendAttachments(attachments = []) {
  if (!attachments.length) return undefined;
  return attachments.map(({ filename, content, encoding }) => {
    if (!filename || content == null) {
      throw new Error('Resend requires a filename and content for each attachment.');
    }
    return {
      filename,
      content: Buffer.from(content, encoding || 'utf8').toString('base64'),
    };
  });
}

export async function sendResendEmail(message) {
  if (!isResendConfigured()) throw new Error('Resend is not configured.');

  const senderEmail = process.env.RESEND_FROM_EMAIL.trim();
  const fromName = typeof message.from === 'string'
    ? message.from.match(/^([^<>\r\n]+)\s*<[^<>]+>$/)?.[1].trim()
    : undefined;
  const response = await fetch(RESEND_SEND_EMAIL_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromName ? `${fromName} <${senderEmail}>` : senderEmail,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html || undefined,
      cc: message.cc || undefined,
      bcc: message.bcc || undefined,
      reply_to: message.replyTo || undefined,
      attachments: resendAttachments(message.attachments),
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Resend rejected the message (HTTP ${response.status}).`);
  }
  const result = await response.json();
  if (typeof result.id !== 'string' || !result.id) {
    throw new Error('Resend did not return a message ID.');
  }
  return result;
}
