import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, registerUser, bearer, mongoose } from '../helpers/app.js';
import { SPARKS } from '../../src/constants/sparks.js';

let t; let u;
beforeAll(async () => { t = await startTestApp(); u = await registerUser(() => t.http()); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await t.stop(); });

describe('GET /sparks/random', () => {
  it('returns { id, kind, text } of the requested kind; defaults to question', async () => {
    for (const kind of ['question', 'challenge']) {
      for (let i = 0; i < 10; i += 1) {
        const r = await t.http().get(`/api/v1/sparks/random?kind=${kind}`).set(bearer(u.accessToken));
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ kind, id: expect.any(String), text: expect.any(String) });
        expect(SPARKS.find((s) => s.id === r.body.data.id)?.text).toBe(r.body.data.text);
      }
    }
    expect((await t.http().get('/api/v1/sparks/random').set(bearer(u.accessToken))).body.data.kind).toBe('question');
  });
  it('can avoid repeating the previous spark, rejects unknown kinds, needs auth', async () => {
    const first = (await t.http().get('/api/v1/sparks/random?kind=question').set(bearer(u.accessToken))).body.data;
    for (let i = 0; i < 15; i += 1) {
      expect((await t.http().get(`/api/v1/sparks/random?kind=question&exclude=${first.id}`).set(bearer(u.accessToken))).body.data.id).not.toBe(first.id);
    }
    expect((await t.http().get('/api/v1/sparks/random?kind=joke').set(bearer(u.accessToken))).status).toBe(400);
    expect((await t.http().get('/api/v1/sparks/random')).status).toBe(401);
  });
  it('data sanity: unique ids, non-empty text', () => {
    expect(new Set(SPARKS.map((s) => s.id)).size).toBe(SPARKS.length);
    expect(SPARKS.every((s) => s.text.length > 5 && s.text.length < 200)).toBe(true);
    expect(SPARKS.filter((s) => s.kind === 'question').length).toBeGreaterThan(5);
    expect(SPARKS.filter((s) => s.kind === 'challenge').length).toBeGreaterThan(5);
  });
});
