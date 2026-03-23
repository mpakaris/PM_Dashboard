import { readData } from '@/lib/db';
import OverviewClient from './OverviewClient';

export default async function OverviewPage() {
  const data = readData();
  return (
    <OverviewClient
      assignments={data.assignments}
      projects={data.projects}
      members={data.teamMembers}
      roles={data.roles}
    />
  );
}
