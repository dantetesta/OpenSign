import { projectDocumentResponse } from './getDocumentResponse.js';
import { getDocumentReaderId, hasDocumentReadAccess } from './documentAccess.js';

export default async function getDocument(request) {
  const docId = request.params.docId;
  const include = request.params.include || '';
  if (typeof docId !== 'string' || !docId) {
    return { error: 'Please pass required parameters!' };
  }

  try {
    const query = new Parse.Query('contracts_Document');
    query.equalTo('objectId', docId);
    query.include('ExtUserPtr');
    query.include('ExtUserPtr.TenantId');
    query.include('CreatedBy');
    query.include('Signers');
    query.include('AuditTrail.UserPtr');
    query.include('Placeholders');
    query.include('DeclineBy');
    query.notEqualTo('IsArchive', true);
    const requestedIncludes = String(include)
      .split(',')
      .map(field => field.trim())
      .filter(field => field === 'Bcc' || field === 'Cc');
    for (const field of requestedIncludes) {
      query.include(field);
    }

    const document = await query.first({ useMasterKey: true });
    const denied = { error: "Document deleted or you don't have access." };
    if (!document) return denied;
    if (!request.master &&
        !hasDocumentReadAccess(document, await getDocumentReaderId(request))) {
      return denied;
    }
    return projectDocumentResponse(document.toJSON(), include);
  } catch {
    return { error: "Document deleted or you don't have access." };
  }
}
