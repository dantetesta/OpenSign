import { normalizeChallengeEmail, useEmailChallenge } from '../../auth/emailChallenge.js';

export default async function VerifyEmail(request) {
  const user = request.user;
  if (!user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'User is not authenticated.');
  }
  const email = normalizeChallengeEmail(request.params.email || user.get('email'));
  if (!email || email !== normalizeChallengeEmail(user.get('email'))) {
    throw new Parse.Error(Parse.Error.INVALID_PARAMETER, 'Invalid email.');
  }
  if (user.get('emailVerified')) return { message: 'Email is already verified.' };
  if (!(await useEmailChallenge(email, '', request.params.otp))) {
    throw new Parse.Error(Parse.Error.INVALID_PARAMETER, 'OTP is invalid.');
  }
  user.set('emailVerified', true);
  await user.save(null, { useMasterKey: true });
  return { message: 'Email is verified.' };
}
