import { getDocumentReaderId, hasDocumentReadAccess } from './documentAccess.js';

export default async function getContact(request) {
  const contactId = request.params.contactId;
  const notFound = () => new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Contact is unavailable.');
  const actor = await getDocumentReaderId(request);
  if (typeof contactId !== 'string' || !contactId || (!request.master && !actor)) throw notFound();
  const query = new Parse.Query('contracts_Contactbook');
  query.equalTo('objectId', contactId);
  query.notEqualTo('IsDeleted', true);
  const contact = await query.first({ useMasterKey: true });
  if (!contact || (!request.master && contact.get('UserId')?.id !== actor &&
      !hasDocumentReadAccess(contact, actor))) {
    throw notFound();
  }
  return contact;
}
