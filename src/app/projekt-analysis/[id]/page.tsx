import { notFound } from 'next/navigation';
import { readProjektAnalysis } from '@/lib/db';
import ProjektAnalysisDetailClient from './ProjektAnalysisDetailClient';

export default async function ProjektAnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projects = await readProjektAnalysis();
  const project = projects.find(p => p.id === id);
  if (!project) notFound();
  return <ProjektAnalysisDetailClient project={project} />;
}
