import { MongoClient } from 'mongodb';
import { serverAppId, useLocal } from '../Utils.js';
import { localFileAddress } from '../cloud/parsefunction/getSignedUrl.js';

let uploadsPromise;

async function uploads() {
  if (!uploadsPromise) {
    const mongo = new MongoClient(process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dev', { maxPoolSize: 2 });
    uploadsPromise = mongo.connect()
      .then(() => mongo.db().collection('_DocSignLocalUpload'))
      .catch(async (error) => {
        uploadsPromise = undefined;
        await mongo.close();
        throw error;
      });
  }
  return uploadsPromise;
}

export async function recordLocalUpload(address, userId) {
  const store = await uploads();
  const entry = await store.findOneAndUpdate(
    { _id: address },
    { $setOnInsert: { userId, createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );
  return entry?.userId === userId;
}

const attachedFiles = ['URL', 'SignedUrl', 'CertificateUrl'];

export async function requireOwnedLocalAttachments(request) {
  if (request.master || useLocal !== 'true') return;
  const userId = request.user?.id;
  const previous = request.original;
  const current = request.object;
  const deny = () => new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Attachment is unavailable.');
  if (!userId || (previous && previous.get('CreatedBy')?.id !== current.get('CreatedBy')?.id)) {
    throw deny();
  }
  if (!previous && current.get('CreatedBy')?.id !== userId) throw deny();
  const owner = current.get('CreatedBy')?.id;
  const membership = current.get('ExtUserPtr')?.id;
  if (membership && membership !== previous?.get('ExtUserPtr')?.id) {
    const query = new Parse.Query('contracts_Users');
    query.equalTo('objectId', membership);
    query.equalTo('UserId', { __type: 'Pointer', className: '_User', objectId: owner });
    query.notEqualTo('IsDisabled', true);
    if (!(await query.first({ useMasterKey: true }))) throw deny();
  }
  const acl = current.getACL() || new Parse.ACL();
  acl.setPublicReadAccess(false);
  acl.setPublicWriteAccess(false);
  if (owner) {
    acl.setReadAccess(owner, true);
    acl.setWriteAccess(owner, true);
  }
  current.setACL(acl);

  for (const field of attachedFiles) {
    const next = current.get(field);
    const old = previous?.get(field);
    if (!next || old === next) continue;
    const address = localFileAddress(next, process.env.SERVER_URL, serverAppId);
    // The same file may have received a new read token.
    if (address && address === localFileAddress(old, process.env.SERVER_URL, serverAppId)) continue;
    if (!address || !(await (await uploads()).findOne({ _id: address, userId }))) throw deny();
  }
}
