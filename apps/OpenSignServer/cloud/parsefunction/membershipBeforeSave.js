const profileFields = new Set(['Phone', 'Name', 'JobTitle', 'Company', 'Language']);

export default async function membershipBeforeSave(request) {
  if (request.master) return;
  const actor = request.user;
  const previous = request.original;
  const denied = () => new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Membership is unavailable.');
  if (!actor || !previous) throw denied();
  const fields = request.object.dirtyKeys();
  const self = previous.get('UserId')?.id === actor.id;
  if (self && previous.get('IsDisabled') !== true && fields.every(field => profileFields.has(field))) {
    return;
  }
  if (self || fields.some(field => field !== 'IsDisabled') ||
      typeof request.object.get('IsDisabled') !== 'boolean') {
    throw denied();
  }

  const query = new Parse.Query('contracts_Users');
  query.equalTo('UserId', actor);
  query.notEqualTo('IsDisabled', true);
  query.limit(2);
  const members = await query.find({ useMasterKey: true });
  if (members.length !== 1) throw denied();
  const [caller] = members;
  const tenant = caller.get('TenantId')?.id;
  const role = caller.get('UserRole');
  const targetRole = previous.get('UserRole');
  if (!tenant || previous.get('TenantId')?.id !== tenant || targetRole === 'contracts_Admin') {
    throw denied();
  }
  if (role === 'contracts_Admin') return;
  const organization = caller.get('OrganizationId')?.id;
  if (role !== 'contracts_OrgAdmin' || !organization ||
      previous.get('OrganizationId')?.id !== organization || targetRole === 'contracts_OrgAdmin') {
    throw denied();
  }
}
