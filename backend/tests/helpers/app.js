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
