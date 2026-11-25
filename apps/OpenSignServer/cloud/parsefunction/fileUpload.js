import { serverAppId } from '../../Utils.js';
import { localFileAddress, validateSignedLocalUrl } from './getSignedUrl.js';

export default async function fileUpload(request) {
  const url = request.params.url;

  if (!localFileAddress(url, process.env.SERVER_URL, serverAppId) ||
      await validateSignedLocalUrl(url) === 'Unauthorized') {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'File is unavailable.');
  }
  return { url };
}
