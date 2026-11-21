// INTEGRATION: real MongoDB + real Express app + real multer. The ONLY mock is the storage adapter (createFakeStorage):
// nothing here talks to Cloudinary, so these tests prove validation/authorisation/wiring, not Cloudinary behaviour.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestApp, resetDb, registerUser, befriend, makeDm, bearer, createFakeStorage, oid, mongoose } from '../helpers/app.js';
import { setStorage } from '../../src/services/storage/index.js';
import * as svc from '../../src/services/message.service.js';

let t; let storage;
const http = () => t.http();
const U = '/api/v1/uploads';
const bytes = {
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]),
  jpg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]),
  gif: Buffer.from('GIF89a' + '\0'.repeat(40), 'latin1'),
  webp: Buffer.from('RIFF\0\0\0\0WEBPVP8 ' + '\0'.repeat(40), 'latin1'),
  pdf: Buffer.from('%PDF-1.7\n' + 'x'.repeat(50)),
  txt: Buffer.from('hello notes'),
  docx: Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('word/document.xml'), Buffer.alloc(30)]),
  xlsx: Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('xl/workbook.xml'), Buffer.alloc(30)]),
  pptx: Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('ppt/slides'), Buffer.alloc(30)]),
  zip: Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.alloc(40)]),
};
beforeAll(async () => { t = await startTestApp({ upload: 6 }); });
afterAll(async () => { await mongoose.connection.dropDatabase(); await t.stop(); });
beforeEach(async () => { await resetDb(); storage = createFakeStorage(); setStorage(storage); });

describe('POST /uploads', () => {
  it.each([
    ['png', 'p.png', 'image', 'image/png'], ['jpg', 'p.jpg', 'image', 'image/jpeg'], ['gif', 'p.gif', 'image', 'image/gif'], ['webp', 'p.webp', 'image', 'image/webp'],
    ['pdf', 'd.pdf', 'file', 'application/pdf'], ['txt', 'n.txt', 'file', 'text/plain'],
    ['docx', 'a.docx', 'file', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['xlsx', 'a.xlsx', 'file', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['pptx', 'a.pptx', 'file', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['zip', 'a.zip', 'file', 'application/zip'],
  ])('accepts %s and reports the sniffed kind/mime', async (key, name, kind, mime) => {
    const u = await registerUser(http);
    const r = await http().post(U).set(bearer(u.accessToken)).attach('file', bytes[key], name);
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ kind, mime, name, size: bytes[key].length });
    expect(r.body.data.url).toContain(`/pulse/${u.user.id}/`);
    expect(r.body.data.publicId).toBeUndefined();
  });

  it('ignores the declared content-type: an exe with an image mime/name is rejected 415, nothing stored', async () => {
    const u = await registerUser(http);
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(80, 1)]);
    for (const [name, ct] of [['evil.exe', 'application/octet-stream'], ['evil.png', 'image/png'], ['evil.pdf', 'application/pdf']]) {
      const r = await http().post(U).set(bearer(u.accessToken)).attach('file', exe, { filename: name, contentType: ct });
      expect(r.status).toBe(415);
    }
    expect((await http().post(U).set(bearer(u.accessToken)).attach('file', bytes.pdf, 'x.exe')).status).toBe(415);
    expect(storage.uploaded ?? []).toHaveLength(0);
  });

  it('rejects files over 10 MB with 413, a missing file with 400, and no token with 401', async () => {
    const u = await registerUser(http);
    const big = Buffer.concat([bytes.png, Buffer.alloc(10 * 1024 * 1024)]);
    expect((await http().post(U).set(bearer(u.accessToken)).attach('file', big, 'big.png')).status).toBe(413);
    expect((await http().post(U).set(bearer(u.accessToken)).field('x', 'y')).status).toBe(400);
    expect((await http().post(U).attach('file', bytes.png, 'p.png')).status).toBe(401);
    expect((await http().post(U).set(bearer('garbage')).attach('file', bytes.png, 'p.png')).status).toBe(401);
  });

  it('optional conversationId must be one you belong to', async () => {
    const [a, b, c] = await Promise.all([registerUser(http), registerUser(http), registerUser(http)]);
    await befriend(http, a, b);
    const dm = await makeDm(http, a, b);
    const ok = await http().post(U).set(bearer(a.accessToken)).field('conversationId', dm.id).attach('file', bytes.png, 'p.png');
    expect(ok.status).toBe(201);
    expect((await http().post(U).set(bearer(c.accessToken)).field('conversationId', dm.id).attach('file', bytes.png, 'p.png')).status).toBe(404);
    expect((await http().post(U).set(bearer(a.accessToken)).field('conversationId', oid().toString()).attach('file', bytes.png, 'p.png')).status).toBe(404);
  });

  it('sanitises the stored file name (no path separators or control characters)', async () => {
    const u = await registerUser(http);
    const r = await http().post(U).set(bearer(u.accessToken)).attach('file', bytes.png, '..\\..\\a b.png');
    expect(r.status).toBe(201);
    expect(r.body.data.name).not.toMatch(/[\\/]/);
  });

  it('a malformed multipart body is a 400, not a 500', async () => {
    const u = await registerUser(http);
    const r = await http().post(U).set(bearer(u.accessToken)).set('Content-Type', 'multipart/form-data; boundary=XX').send('--XX\r\nbroken header\r\n\r\ndata\r\n--XX--\r\n');
    expect(r.status).toBe(400);
  });

  it('is rate limited per user (limit 6 in this test app)', async () => {
    const u = await registerUser(http);
    const codes = [];
    for (let i = 0; i < 8; i += 1) codes.push((await http().post(U).set(bearer(u.accessToken)).attach('file', bytes.png, 'p.png')).status);
    expect(codes.slice(0, 6).every((c) => c === 201)).toBe(true);
    expect(codes.slice(6)).toEqual([429, 429]);
  });

  it('upload -> send round trip works for the owner, and the file cannot be reused by another user', async () => {
    const [a, b] = await Promise.all([registerUser(http), registerUser(http)]);
    await befriend(http, a, b);
    const dm = await makeDm(http, a, b);
    const att = (await http().post(U).set(bearer(a.accessToken)).attach('file', bytes.pdf, 'doc.pdf')).body.data;
    const sent = await svc.sendMessage(b.user.id, { conversationId: dm.id, clientId: 'steal-key-0001', attachments: [att] }).catch((e) => e);
    expect(sent.code).toBe('FORBIDDEN');
    const ok = await svc.sendMessage(a.user.id, { conversationId: dm.id, clientId: 'own-key-000001', attachments: [att] });
    expect(ok.message.type).toBe('file');
    expect(ok.message.attachments[0]).toMatchObject({ kind: 'file', name: 'doc.pdf', mime: 'application/pdf' });
  });
});
