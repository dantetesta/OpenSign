import axios from 'axios';
import { cloudServerUrl, serverAppId } from '../../Utils.js';

export async function getDocumentReaderId(request) {
  if (request.user?.id) return request.user.id;
  const session = request.headers?.sessiontoken;
  if (!session) return null;
  try {
    const { data } = await axios.get(cloudServerUrl + '/users/me', {
      headers: {
        'X-Parse-Application-Id': serverAppId,
        'X-Parse-Session-Token': session,
      },
      timeout: 7000,
    });
    return data?.objectId || null;
  } catch {
    return null;
  }
}

export function hasDocumentReadAccess(record, userId) {
  return Boolean(userId && (
    record.get('CreatedBy')?.id === userId || record.getACL()?.getReadAccess(userId)
  ));
}
