import { notFound } from 'next/navigation';
import { readProjektAnalysis, readData } from '@/lib/db';
import ProjektAnalysisDetailClient from './ProjektAnalysisDetailClient';

export default async function ProjektAnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [projects, appData] = await Promise.all([readProjektAnalysis(), readData()]);
  const project = projects.find(p => p.id === id);
  if (!project) notFound();
  return (
    <ProjektAnalysisDetailClient
      project={project}
      planningProjects={appData.projects}
      planningAssignments={appData.assignments}
      teamMembers={appData.teamMembers}
    />
  );
}
