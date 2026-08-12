import { getFmoProjects } from '@/actions/fmoProjects';
import { getFmoMappings } from '@/actions/fmo';
import ProjectsClient from './ProjectsClient';

export default async function FmoProjectsPage() {
  const [projects, mappings] = await Promise.all([getFmoProjects(), getFmoMappings()]);
  return <ProjectsClient projects={projects} wbsEntries={mappings.wbs} />;
}
