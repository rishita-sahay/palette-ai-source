// Vercel Serverless Function: POST /api/interpret  (GET reports whether AI is configured).
// Reads ANTHROPIC_API_KEY and/or GEMINI_API_KEY from the server environment. Nothing here is bundled into the browser.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleInterpret } from '../server/interpret-core.js';

export const config = { maxDuration: 30 };

async function readJson(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw new Error('too large');
  }
  return raw ? JSON.parse(raw) : undefined;
}

export default async function handler(req: IncomingMessage & { body?: unknown }, res: ServerResponse) {
  let body: unknown;
  try {
    body = req.method === 'POST' ? await readJson(req) : undefined;
  } catch {
    body = undefined; // falls through to a 400 from validation
  }
  const forwarded = req.headers['x-forwarded-for'];
  const clientId = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.socket?.remoteAddress || undefined;
  const result = await handleInterpret({ method: req.method ?? 'GET', body, clientId }, process.env);
  res.statusCode = result.status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(result.body));
}
