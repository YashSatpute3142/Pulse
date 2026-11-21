import request from 'supertest';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { createApp } from '../../src/app.js';
import * as models from '../../src/models/index.js';

export async function startTestApp(limits) {
  await connectDb();
  // Build every index (incl. unique/partial/TTL) before tests rely on them.
  await Promise.all(Object.values(models).map((M) => M.syncIndexes()));
  const app = createApp({ limits });
  return { app, http: () => request(app), stop: disconnectDb };
}

export async function resetDb() {
  await Promise.all(Object.values(models).map((M) => M.deleteMany({})));
}

let n = 0;
export const sampleUser = (over = {}) => {
  n += 1;
  return { username: `user_${n}_${Date.now() % 100000}`, email: `user${n}_${Date.now() % 100000}@example.com`, password: 'correct horse battery', displayName: `User ${n}`, ...over };
};

/** Register through the real HTTP API. Returns { body, accessToken, user, cookie, rt } */
export async function registerUser(http, over = {}) {
  const payload = sampleUser(over);
  const res = await http().post('/api/v1/auth/register').send(payload);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { payload, res, user: res.body.data.user, accessToken: res.body.data.accessToken, cookies: res.headers['set-cookie'], rt: cookieValue(res.headers['set-cookie']) };
}

export function cookieValue(setCookie, name = 'pulse_rt') {
  const line = (setCookie || []).find((c) => c.startsWith(`${name}=`));
  return line ? line.split(';')[0].slice(name.length + 1) : null;
}
export const bearer = (token) => ({ Authorization: `Bearer ${token}` });
export { mongoose };

// ---- relationship / conversation helpers (all through the real HTTP API) ------------------------------------------
import crypto from 'node:crypto';
import { events } from '../../src/utils/events.js';

export async function befriend(http, a, b) {
  const s = await http().post('/api/v1/friends/requests').set(bearer(a.accessToken)).send({ userId: b.user.id });
  if (s.status !== 201) throw new Error(`friend request failed: ${s.status} ${JSON.stringify(s.body)}`);
  const acc = await http().post(`/api/v1/friends/requests/${a.user.id}/accept`).set(bearer(b.accessToken));
  if (acc.status !== 200) throw new Error(`accept failed: ${acc.status} ${JSON.stringify(acc.body)}`);
}

export async function makeDm(http, a, b) {
  const r = await http().post('/api/v1/conversations').set(bearer(a.accessToken)).send({ type: 'direct', userId: b.user.id });
  if (![200, 201].includes(r.status)) throw new Error(`createDirect failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data;
}

export async function makeGroup(http, owner, members, title = 'Team') {
  const r = await http().post('/api/v1/conversations').set(bearer(owner.accessToken)).send({ type: 'group', title, memberIds: members.map((m) => m.user.id) });
  if (r.status !== 201) throw new Error(`createGroup failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data;
}

export function captureEvents(name) {
  const got = [];
  const fn = (e) => got.push(e);
  events.on(name, fn);
  return { got, stop: () => events.off(name, fn) };
}

/** MOCKED file storage (Cloudinary is unreachable from the test environment). Everything else in upload tests is real. */
export function createFakeStorage() {
  const fake = {
    uploaded: [], destroyed: [],
    async upload({ buffer, kind, ext, userId }) {
      const rand = crypto.randomBytes(9).toString('base64url');
      const publicId = kind === 'image' ? `pulse/${userId}/${rand}` : `pulse/${userId}/${rand}.${ext}`;
      const url = `https://res.cloudinary.com/testcloud/${kind === 'image' ? 'image' : 'raw'}/upload/v1700000000/${publicId}${kind === 'image' ? `.${ext}` : ''}`;
      fake.uploaded.push({ publicId, kind, bytes: buffer.length });
      return { url, publicId, ...(kind === 'image' ? { width: 640, height: 480 } : {}) };
    },
    async destroy(items) { fake.destroyed.push(...items); },
  };
  return fake;
}

export const oid = () => new mongoose.Types.ObjectId();
