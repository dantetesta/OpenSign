import crypto from 'node:crypto';
import express from 'express';
import { google } from 'googleapis';
import { MongoClient } from 'mongodb';
import { provisionGoogleWorkspace } from './googleWorkspace.js';

function configuredOrigin() {
  try {
    return new URL(process.env.PUBLIC_URL).origin;
  } catch {
    return undefined;
  }
}

const appOrigin = configuredOrigin();
const clientId = process.env.DOCSIGN_GOOGLE_CLIENT_ID;
const signupEnabled = process.env.DOCSIGN_GOOGLE_SIGNUP_ENABLED === 'true';
const parseRoot = 'http://127.0.0.1:8080/app';
const nonceLifetime = 5 * 60 * 1000;
const nonces = new Map();
const memberRoles = new Set(['contracts_Admin', 'contracts_OrgAdmin', 'contracts_Editor', 'contracts_User']);
let storePromise;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function sessionHash(session) {
  return session && crypto.createHash('sha256').update(session).digest('hex');
}

async function authStores() {
  if (!storePromise) {
    const mongo = new MongoClient(process.env.DATABASE_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/dev', { maxPoolSize: 2 });
    storePromise = mongo.connect().then(async () => {
      const db = mongo.db();
      const identities = db.collection('_DocSignGoogleIdentity');
      await identities.createIndex({ subject: 1 }, { unique: true });
      await identities.createIndex({ userId: 1 }, { unique: true });
      return { identities, reservations: db.collection('_DocSignGoogleProvisioning') };
    }).catch(async (error) => {
      storePromise = undefined;
      await mongo.close();
      throw error;
    });
  }
  return storePromise;
}

async function parse(path, { session, master = false, method = 'GET', body } = {}) {
  const headers = {
    'X-Parse-Application-Id': process.env.APP_ID || 'opensign',
  };
  if (session) headers['X-Parse-Session-Token'] = session;
  if (master) headers['X-Parse-Master-Key'] = process.env.MASTER_KEY;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(parseRoot + path, {
    headers,
    method,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(7000),
  });
  if (response.status === 401 || response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error('OpenSign account service unavailable');
  return response.json();
}

async function activeMember(user, email) {
  if (!user?.objectId || !email || normalizeEmail(user.email) !== email) return false;
  // Match the email lookup used by getUserDetails and reject ambiguous memberships.
  const query = new URLSearchParams({
    where: JSON.stringify({ Email: user.email }),
    keys: 'UserId,UserRole,IsDisabled,TenantId',
    limit: '2',
  });
  const membership = await parse('/classes/contracts_Users?' + query, { master: true });
  if (membership?.results?.length !== 1) return false;
  const [record] = membership.results;
  return record.UserId?.objectId === user.objectId &&
    Boolean(record.TenantId?.objectId) &&
    memberRoles.has(record.UserRole) &&
    record.IsDisabled !== true;
}

async function registeredGmailUser(email) {
  // Google is authoritative for Gmail addresses on an already verified ID token.
  if (!email.endsWith('@gmail.com')) return null;
  const query = new URLSearchParams({
    where: JSON.stringify({ email }),
    keys: 'email',
    limit: '2',
  });
  const result = await parse('/users?' + query, { master: true });
  return result?.results?.length === 1 ? result.results[0] : null;
}

function reject(res) {
  return res.status(403).json({ error: 'Google sign-in unavailable for this account.' });
}

async function bindIdentity(identities, email, subject, userId) {
  try {
    const binding = await identities.findOneAndUpdate(
      { _id: email },
      { $setOnInsert: { subject, userId, linkedAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
    return binding?.subject === subject && binding.userId === userId;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

export function createDocSignGoogleRouter() {
  const router = express.Router();
  const verifier = new google.auth.OAuth2(clientId);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!clientId || !appOrigin) return res.sendStatus(404);
    if (req.get('Origin') !== appOrigin) return reject(res);
    next();
  });
  router.use(express.json({ limit: '16kb' }));

  router.post('/challenge', async (req, res) => {
    const mode = req.body?.mode;
    if (mode !== 'link' && mode !== 'login') return res.sendStatus(400);
    const session = req.get('X-Parse-Session-Token');
    if (mode === 'link') {
      if (!session) return reject(res);
      const user = await parse('/users/me', { session });
      const email = normalizeEmail(user?.email);
      if (!(await activeMember(user, email))) return reject(res);
      const { identities } = await authStores();
      if (await identities.findOne({ _id: email, userId: user.objectId })) {
        return res.json({ linked: true });
      }
    }
    const now = Date.now();
    for (const [nonce, record] of nonces) {
      if (record.expiresAt <= now) nonces.delete(nonce);
      else break;
    }
    if (nonces.size >= 512) return res.sendStatus(429);
    const nonce = crypto.randomBytes(32).toString('base64url');
    nonces.set(nonce, { mode, session: sessionHash(session), expiresAt: now + nonceLifetime });
    res.json({
      nonce,
      ...(mode === 'login' && { directGmailEnabled: true, signupEnabled }),
    });
  });

  router.post('/complete', async (req, res) => {
    const { mode, nonce, credential } = req.body || {};
    if (typeof nonce !== 'string' || typeof credential !== 'string' || credential.length > 12000) {
      return res.sendStatus(400);
    }
    const session = req.get('X-Parse-Session-Token');
    const challenge = nonces.get(nonce);
    if (!challenge || challenge.expiresAt <= Date.now() || challenge.mode !== mode ||
      challenge.session !== sessionHash(session)) {
      return reject(res);
    }
    nonces.delete(nonce);
    let identity;
    try {
      const ticket = await verifier.verifyIdToken({ idToken: credential, audience: clientId });
      identity = ticket.getPayload();
    } catch {
      return reject(res);
    }
    const email = normalizeEmail(identity?.email);
    if (typeof identity?.sub !== 'string' || !identity.sub || identity.nonce !== nonce ||
      identity.email_verified !== true || !email) {
      return reject(res);
    }
    const { identities, reservations } = await authStores();
    if (mode === 'link') {
      const user = await parse('/users/me', { session });
      if (!(await activeMember(user, email))) return reject(res);
      if (!(await bindIdentity(identities, email, identity.sub, user.objectId))) return reject(res);
      return res.json({ linked: true });
    }
    const binding = await identities.findOne({ _id: email, subject: identity.sub });
    let user;
    if (binding) {
      user = await parse('/users/' + encodeURIComponent(binding.userId), { master: true });
    } else {
      if (await identities.findOne({ $or: [{ _id: email }, { subject: identity.sub }] })) {
        return reject(res);
      }
      user = await registeredGmailUser(email);
      if (!user && signupEnabled) {
        user = await provisionGoogleWorkspace(reservations, parse, {
          sub: identity.sub,
          email,
          name: typeof identity.name === 'string' ? identity.name : undefined,
        });
      }
    }
    if (!(await activeMember(user, email))) return reject(res);
    if (!binding && !(await bindIdentity(identities, email, identity.sub, user.objectId))) return reject(res);
    const auth = await parse('/loginAs?' + new URLSearchParams({ userId: user.objectId }), {
      master: true,
      method: 'POST',
    });
    if (!auth?.sessionToken || auth.objectId !== user.objectId) return reject(res);
    res.json({ sessionToken: auth.sessionToken });
  });

  router.use((error, _req, res, _next) => {
    const status = error.status === 400 || error.status === 413 ? error.status : 503;
    res.status(status).json({ error: 'Google sign-in could not be completed.' });
  });
  return router;
}
