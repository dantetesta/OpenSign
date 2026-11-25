import { getSignedLocalUrl, localFileAddress } from '../cloud/parsefunction/getSignedUrl.js';
import { getDocumentReaderId } from '../cloud/parsefunction/documentAccess.js';
import { recordLocalUpload } from './localUploadOwnership.js';

export function localUploadReceipt(serverUrl, appId) {
  return (req, res, next) => {
    const json = res.json.bind(res);
    res.json = async (body) => {
      const file = res.statusCode === 201 && body?.name &&
        localFileAddress(body.url, serverUrl, appId);
      if (file) {
        try {
          const userId = await getDocumentReaderId({
            headers: { sessiontoken: req.get('X-Parse-Session-Token') },
          });
          if (userId && !(await recordLocalUpload(file, userId))) throw new Error('File unavailable');
          // Parse generated this address after successfully saving this upload.
          const url = getSignedLocalUrl(file);
          res.setHeader('Location', url);
          return json({ ...body, url });
        } catch {
          res.status(503);
          res.removeHeader('Location');
          return json({ error: 'File is unavailable.' });
        }
      }
      return json(body);
    };
    next();
  };
}
