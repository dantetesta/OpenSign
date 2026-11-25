import { getDocumentReaderId, hasDocumentReadAccess } from './documentAccess.js';

const privateFields = ['FileAdapters', 'PfxFile', 'SmtpConfig'];
const guestFields = ['SignatureType', 'RequestBody', 'RequestSubject', 'CompletionBody', 'CompletionSubject'];

async function memberTenant(userId) {
  const query = new Parse.Query('contracts_Users');
  query.equalTo('UserId', { __type: 'Pointer', className: '_User', objectId: userId });
  query.notEqualTo('IsDisabled', true);
  const membership = await query.first({ useMasterKey: true });
  return membership?.get('TenantId')?.id;
}

async function documentTenant(docId, actor) {
  if (typeof docId !== 'string' || !docId || docId.length > 128) return null;
  const docs = new Parse.Query('contracts_Document');
  docs.equalTo('objectId', docId);
  docs.notEqualTo('IsArchive', true);
  docs.include('ExtUserPtr');
  const document = await docs.first({ useMasterKey: true });
  if (!document || !hasDocumentReadAccess(document, actor)) return null;
  return document.get('ExtUserPtr')?.get('TenantId')?.id;
}

export default async function getTenant(request) {
  const { userId, docId, excludeCounts } = request.params;
  const actor = await getDocumentReaderId(request);
  if (!actor && !request.master) return {};

  const isOwn = userId && (request.master || userId === actor);
  const ownTenant = isOwn ? await memberTenant(userId) : null;
  const tenantId = ownTenant || await documentTenant(docId, actor);
  if (!tenantId) return {};

  const tenant = new Parse.Query('partners_Tenant');
  tenant.equalTo('objectId', tenantId);
  if (ownTenant) {
    for (const field of privateFields) tenant.exclude(field);
    if (excludeCounts) {
      tenant.exclude('DocumentCount');
      tenant.exclude('TemplateCount');
    }
  } else {
    tenant.select(...guestFields);
  }
  return await tenant.first({ useMasterKey: true }) || {};
}
