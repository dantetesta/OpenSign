import { createHmac, randomInt } from 'node:crypto';
import { MongoClient } from 'mongodb';

const lifetimeMs = 10 * 60 * 1000;
const cooldownMs = 60 * 1000;
const maxAttempts = 5;
let storePromise;

export function normalizeChallengeEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

async function otpStore() {
  if (!storePromise) {
    const mongo = new MongoClient(process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dev', { maxPoolSize: 2 });
    storePromise = mongo.connect().then(async () => {
      const collection = mongo.db().collection('_DocSignEmailChallenge');
      await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      return collection;
    }).catch(async (error) => {
      storePromise = undefined;
      await mongo.close();
      throw error;
    });
  }
  return storePromise;
}

const digest = (email, documentId, code) =>
  createHmac('sha256', process.env.MASTER_KEY)
    .update(JSON.stringify([email, documentId || '', code])).digest('hex');

export async function sendEmailChallenge(email, documentId, sendCode) {
  const store = await otpStore();
  const _id = email;
  const now = new Date();
  const code = String(randomInt(1000, 10000));
  const codeDigest = digest(email, documentId, code);
  try {
    // A resend replaces a code while preserving its attempt budget until expiry.
    const result = await store.findOneAndUpdate(
      { _id, $or: [
        { expiresAt: { $lte: now } },
        { resendAfter: { $lte: now }, attempts: { $lt: maxAttempts } },
      ] },
      [
        { $set: {
          codeDigest,
          documentId: documentId || '',
          expiresAt: { $cond: [
            { $gt: ['$expiresAt', now] }, '$expiresAt', new Date(now.getTime() + lifetimeMs),
          ] },
          attempts: { $cond: [{ $gt: ['$expiresAt', now] }, '$attempts', 0] },
          resendAfter: new Date(now.getTime() + cooldownMs),
        } },
        { $unset: 'usedAt' },
      ],
      { upsert: true, returnDocument: 'after' }
    );
    if (!result) return false;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
  try {
    await sendCode(code);
    return true;
  } catch {
    await store.updateOne({ _id, codeDigest }, { $set: { expiresAt: now } });
    throw new Error('Verification delivery failed.');
  }
}

export async function useEmailChallenge(email, documentId, code) {
  if (typeof code !== 'string' || !/^\d{4}$/.test(code)) return false;
  const store = await otpStore();
  const _id = email;
  const now = new Date();
  const active = {
    _id,
    documentId: documentId || '',
    expiresAt: { $gt: now },
    attempts: { $lt: maxAttempts },
    usedAt: { $exists: false },
  };
  const codeDigest = digest(email, documentId, code);
  const result = await store.updateOne(
    { ...active, codeDigest },
    { $set: { usedAt: now }, $unset: { codeDigest: 1 } }
  );
  if (result.modifiedCount === 1) return true;
  await store.updateOne(active, { $inc: { attempts: 1 } });
  return false;
}
