import { defaultSenderEmail } from '../../utils/resendEmail.js';
import { smtpenable, updateMailCount } from '../../Utils.js';
import { normalizeChallengeEmail, sendEmailChallenge } from '../../auth/emailChallenge.js';
import { escapeHtml, renderEmailHeading, resolveBrandContext } from '../../utils/brandContext.js';

async function getInvitedDocument(docId, email) {
  if (typeof docId !== 'string' || !docId || docId.length > 128) return null;
  const query = new Parse.Query('contracts_Document');
  query.equalTo('objectId', docId);
  query.equalTo('SentToOthers', true);
  query.notEqualTo('IsArchive', true);
  query.include('Signers');
  query.include('Placeholders.signerPtr');
  const document = await query.first({ useMasterKey: true });
  if (!document) return null;
  const signers = document.get('Signers') || [];
  const widgets = document.get('Placeholders') || [];
  const invited = signers.some(signer => normalizeChallengeEmail(signer.get?.('Email')) === email) ||
    widgets.some(item => item.Role !== 'prefill' && [
      item.email, item.signerPtr?.get?.('Email'), item.signerPtr?.Email,
    ].some(value => normalizeChallengeEmail(value) === email));
  return invited ? document : null;
}

export default async function sendMailOTPv1(request) {
  const email = normalizeChallengeEmail(request.params.email);
  const docId = request.params.docId;
  const denied = () => new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Verification unavailable.');
  if (!email) throw denied();

  const document = docId ? await getInvitedDocument(docId, email) : null;
  if ((docId && !document) || (!docId && normalizeChallengeEmail(request.user?.get('email')) !== email)) {
    throw denied();
  }

  const brand = resolveBrandContext({});
  const sender = defaultSenderEmail(smtpenable ? process.env.SMTP_USER_EMAIL : process.env.MAILGUN_SENDER);
  const sent = await sendEmailChallenge(email, docId, async code => {
    await Parse.Cloud.sendEmail({
      sender: brand.senderName + ' <' + sender + '>',
      recipient: email,
      subject: brand.productName + ' — verification code',
      text: 'Verification code: ' + code,
      html: '<div style="font-family:system-ui;padding:20px">' +
        renderEmailHeading(brand, 'Verification code') + '<p>Verification code for ' +
        escapeHtml(brand.productName) + ': <strong>' + code + '</strong></p></div>',
    });
  });
  if (!sent) throw denied();
  const extendedOwnerId = document?.get('ExtUserPtr')?.id;
  if (extendedOwnerId) updateMailCount(extendedOwnerId);
  return 'Otp send';
}
