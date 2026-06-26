import { Express } from 'express';
import path from 'path';

export function registerPageRoutes(app: Express, publicDir: string): void {
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}
