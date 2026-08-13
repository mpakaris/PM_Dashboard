import { notFound } from 'next/navigation';
import { getFmoProjects } from '@/actions/fmoProjects';
import { getFmoData } from '@/actions/fmo';
import { readData } from '@/lib/db';
import { entryBelongsToProject } from '@/lib/utils';
import ProjectDetailClient from './ProjectDetailClient';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [projects, { store, mappings }, appData] = await Promise.all([
    getFmoProjects(),
    getFmoData(),
    readData(),
  ]);
  const project = projects.find(p => p.id === id);
  if (!project) notFound();

  const projectEntries = store.entries.filter(e => entryBelongsToProject(e, project));

  return (
    <ProjectDetailClient
      project={project}
      entries={projectEntries}
      wbs={mappings.wbs}
      members={mappings.members}
      tickets={mappings.tickets}
      subCategories={mappings.subCategories}
      allProjects={projects}
      forecasts={appData.forecasts}
    />
  );
}
