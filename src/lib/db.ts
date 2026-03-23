import fs from 'fs';
import path from 'path';
import { AppData } from './types';

const dbPath = path.join(process.cwd(), 'data', 'db.json');

function ensureDataDir() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    const empty: AppData = {
      roles: [],
      profiles: [],
      teamMembers: [],
      projects: [],
      assignments: [],
    };
    fs.writeFileSync(dbPath, JSON.stringify(empty, null, 2), 'utf-8');
  }
}

export function readData(): AppData {
  ensureDataDir();
  const raw = fs.readFileSync(dbPath, 'utf-8');
  const data = JSON.parse(raw);
  return {
    roles: data.roles ?? [],
    profiles: data.profiles ?? [],
    teamMembers: data.teamMembers ?? [],
    projects: data.projects ?? [],
    assignments: data.assignments ?? [],
  };
}

export function writeData(data: AppData): void {
  ensureDataDir();
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}
