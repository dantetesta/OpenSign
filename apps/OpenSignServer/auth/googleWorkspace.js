import { randomBytes, randomUUID } from 'node:crypto';

const leaseDurationMs = 5 * 60 * 1000;
const markerField = 'DocSignGoogleProvisioningId';
const accountRole = 'contracts_OrgAdmin';

const pointer = (className, objectId) => ({ __type: 'Pointer', className, objectId });

async function findOne(parse, path, where) {
  const params = new URLSearchParams({ where: JSON.stringify(where), limit: '2' });
  const response = await parse(path + '?' + params, { master: true });
  if (!Array.isArray(response?.results) || response.results.length > 1) {
    throw new Error('Ambiguous workspace provisioning record');
  }
  return response.results[0];
}

async function create(parse, path, body) {
  const result = await parse(path, { master: true, method: 'POST', body });
  if (!result?.objectId) throw new Error('OpenSign workspace could not be created');
  return result.objectId;
}

async function provision(parse, reservation, identity) {
  const { email, marker } = reservation;
  const owned = { [markerField]: marker };
  const name = identity.name?.trim().slice(0, 100) || email.split('@')[0].slice(0, 100);
  const title = name + ' – DocSign';
  let user = await findOne(parse, '/users', { ...owned, username: email, email });
  if (!user) {
    const existing = await findOne(parse, '/users', { $or: [{ email }, { username: email }] });
    if (existing) return null;
    const objectId = await create(parse, '/users', {
      ...owned,
      email,
      username: email,
      name,
      password: randomBytes(48).toString('base64url'),
    });
    user = { objectId, email };
  }

  const owner = pointer('_User', user.objectId);
  const acl = { [user.objectId]: { read: true } };
  const base = { ...owned, ACL: acl };
  const ensure = async (className, where, values) => {
    const path = '/classes/' + className;
    const record = await findOne(parse, path, { ...owned, ...where });
    return record?.objectId || create(parse, path, { ...base, ...where, ...values });
  };

  const tenantId = await ensure('partners_Tenant',
    { UserId: owner, CreatedBy: owner },
    { TenantName: title, EmailAddress: email, IsActive: true }
  );
  const tenant = pointer('partners_Tenant', tenantId);
  const memberId = await ensure('contracts_Users',
    { UserId: owner, TenantId: tenant },
    { Name: name, Email: email, Company: title, Language: 'pt-BR', IsDisabled: false,
      ACL: { [user.objectId]: { read: true, write: true } } }
  );
  const organizationId = await ensure('contracts_Organizations',
    { TenantId: tenant, ExtUserId: pointer('contracts_Users', memberId), CreatedBy: owner },
    { Name: title, IsActive: true }
  );
  const organization = pointer('contracts_Organizations', organizationId);
  const teamId = await ensure('contracts_Teams',
    { OrganizationId: organization },
    { Name: 'Equipe principal', IsActive: true }
  );
  const membership = await parse('/classes/contracts_Users/' + encodeURIComponent(memberId), {
    master: true,
    method: 'PUT',
    body: {
      UserRole: accountRole,
      OrganizationId: organization,
      TeamIds: [pointer('contracts_Teams', teamId)],
    },
  });
  if (!membership) throw new Error('OpenSign workspace membership could not be activated');
  return user;
}

export async function provisionGoogleWorkspace(reservations, parse, { sub, email, name }) {
  const now = new Date();
  const lease = randomUUID();
  let reservation;
  try {
    reservation = await reservations.findOneAndUpdate(
      { _id: sub, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
      {
        $setOnInsert: { email, marker: randomUUID(), createdAt: now },
        $set: { lease, leaseUntil: new Date(now.getTime() + leaseDurationMs) },
      },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
  if (!reservation) return null;
  let finished = false;
  try {
    const user = reservation.email === email ? await provision(parse, reservation, { name }) : null;
    finished = true;
    return user;
  } finally {
    // An interrupted Parse request may still commit. Keep the lease until it expires.
    if (finished) {
      await reservations.updateOne({ _id: sub, lease }, { $unset: { lease: 1, leaseUntil: 1 } });
    }
  }
}
