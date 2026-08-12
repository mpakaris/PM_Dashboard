import { notFound } from 'next/navigation';
import { getFmoProjects } from '@/actions/fmoProjects';
import { getFmoData } from '@/actions/fmo';
import ProjectDetailClient from './ProjectDetailClient';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [projects, { store, mappings }] = await Promise.all([getFmoProjects(), getFmoData()]);
  const project = projects.find(p => p.id === id);
  if (!project) notFound();

  const projectEntries = store.entries.filter(e => e.wbsCode && project.wbsCodes.includes(e.wbsCode));

  return (
    <ProjectDetailClient
      project={project}
      entries={projectEntries}
      wbs={mappings.wbs}
      members={mappings.members}
      tickets={mappings.tickets}
      subCategories={mappings.subCategories}
      allProjects={projects}
    />
  );
}
