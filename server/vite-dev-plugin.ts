// Serves /api/interpret during `npm run dev` and `npm run preview`, using the same handler as production.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import handler from '../api/interpret.js';

export function interpretApiDevPlugin(): Plugin {
  const mount = (middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => void }, mode: string) => {
    // Server-only variables (no VITE_ prefix) from .env / .env.local. They are never exposed to client code.
    Object.assign(process.env, { ...loadEnv(mode, process.cwd(), ''), ...process.env });
    middlewares.use('/api/interpret', (req, res) => void handler(req, res));
  };
  return {
    name: 'palette-ai-interpret-api',
    configureServer(server) { mount(server.middlewares, server.config.mode); },
    configurePreviewServer(server) { mount(server.middlewares, server.config.mode); },
  };
}
