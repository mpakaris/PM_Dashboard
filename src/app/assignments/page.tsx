import { readData } from '@/lib/db';
import AssignmentsClient from './AssignmentsClient';

export default async function AssignmentsPage() {
  const data = await readData();
  return (
    <AssignmentsClient
      assignments={data.assignments}
      projects={data.projects}
      members={data.teamMembers}
      roles={data.roles}
    />
  );
}
