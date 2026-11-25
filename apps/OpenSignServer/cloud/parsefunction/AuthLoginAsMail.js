import axios from 'axios';
import { cloudServerUrl, serverAppId } from '../../Utils.js';
import { normalizeChallengeEmail, useEmailChallenge } from '../../auth/emailChallenge.js';

export default async function AuthLoginAsMail(request) {
  const { otp, docId } = request.params;
  const email = normalizeChallengeEmail(request.params.email);
  if (!email || typeof docId !== 'string' || !docId || docId.length > 128 ||
      !(await useEmailChallenge(email, docId, otp))) {
    return 'Invalid Otp';
  }

  const query = new Parse.Query(Parse.User);
  query.equalTo('email', email);
  query.limit(2);
  const users = await query.find({ useMasterKey: true });
  if (users.length !== 1) return 'user not found!';
  const [user] = users;
  if (!user.get('emailVerified')) {
    user.set('emailVerified', true);
    await user.save(null, { useMasterKey: true });
  }

  const { data } = await axios.post(cloudServerUrl + '/loginAs', null, {
    headers: {
      'X-Parse-Application-Id': serverAppId,
      'X-Parse-Master-Key': process.env.MASTER_KEY,
    },
    params: { userId: user.id },
    timeout: 7000,
  });
  if (!data?.sessionToken || data.objectId !== user.id) return 'user not found!';
  return data;
}
