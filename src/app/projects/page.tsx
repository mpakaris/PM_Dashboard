import { readData } from '@/lib/db';
import ProjectsClient from './ProjectsClient';

export default async function ProjectsPage() {
  const data = await readData();
  return <ProjectsClient projects={data.projects} members={data.teamMembers} assignments={data.assignments} />;
}
