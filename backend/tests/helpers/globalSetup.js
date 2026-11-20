// Starts ONE real mongod (not mocked, not in-memory emulation) for the whole test run and shares its URI.
// Binary: $MONGOD_BIN, else `mongod` on PATH. Optional: $MONGODB_TEST_URI to reuse an already running MongoDB
// (each test file still gets its own database name, so nothing collides).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
const { MongoClient } = mongoose.mongo;

const onPath = (cmd) => (process.env.PATH || '').split(path.delimiter).some((d) => d && fs.existsSync(path.join(d, cmd)));

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  s.on('error', reject);
});

export default async function setup({ provide }) {
  if (process.env.MONGODB_TEST_URI) {
    provide('mongoUri', process.env.MONGODB_TEST_URI);
    return;
  }
  const bin = process.env.MONGOD_BIN || 'mongod';
  if (!process.env.MONGOD_BIN && !onPath('mongod')) {
    // Fallback for dev machines with no mongod installed: mongodb-memory-server downloads a real mongod binary.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mms = await MongoMemoryServer.create();
    provide('mongoUri', mms.getUri().replace(/\/$/, ''));
    return async () => { await mms.stop(); };
  }
  const dbpath = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-mongo-'));
  const port = await freePort();
  const child = spawn(bin, ['--dbpath', dbpath, '--port', String(port), '--bind_ip', '127.0.0.1', '--nounixsocket'], { stdio: 'ignore' });
  let exited = false;
  child.on('exit', () => { exited = true; });
  child.on('error', (e) => { throw new Error(`Cannot start mongod ("${bin}"): ${e.message}. Set MONGOD_BIN or MONGODB_TEST_URI.`); });

  const uri = `mongodb://127.0.0.1:${port}`;
  const deadline = Date.now() + 40_000;
  for (;;) {
    if (exited) throw new Error('mongod exited during startup');
    try {
      const c = new MongoClient(uri, { serverSelectionTimeoutMS: 500 });
      await c.connect(); await c.db('admin').command({ ping: 1 }); await c.close();
      break;
    } catch {
      if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error('mongod did not become ready in 40s'); }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  provide('mongoUri', uri);

  return async () => {
    child.kill('SIGTERM');
    await new Promise((r) => { if (exited) r(); else child.on('exit', r); setTimeout(r, 5000); });
    fs.rmSync(dbpath, { recursive: true, force: true });
  };
}
