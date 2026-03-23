import { readData } from '@/lib/db';
import ProjectsClient from './ProjectsClient';

export default async function ProjectsPage() {
  const data = readData();
  return <ProjectsClient projects={data.projects} members={data.teamMembers} />;
}
