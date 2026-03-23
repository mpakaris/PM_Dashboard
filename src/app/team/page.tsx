import { readData } from '@/lib/db';
import TeamClient from './TeamClient';

export default async function TeamPage() {
  const data = readData();
  return (
    <TeamClient
      members={data.teamMembers}
      roles={data.roles}
      profiles={data.profiles}
    />
  );
}
