import { notFound } from 'next/navigation';
import { getFmoForecasts } from '@/actions/fmoPlanning';
import { getFmoProjects } from '@/actions/fmoProjects';
import { getFmoData } from '@/actions/fmo';
import FmoPlanningDetailClient from './FmoPlanningDetailClient';

export default async function FmoPlanningDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [forecasts, projects, { store, mappings }] = await Promise.all([
    getFmoForecasts(),
    getFmoProjects(),
    getFmoData(),
  ]);
  const forecast = forecasts.find(f => f.id === id);
  if (!forecast) notFound();

  return (
    <FmoPlanningDetailClient
      forecast={forecast}
      projects={projects}
      members={mappings.members}
      wbs={mappings.wbs}
      entries={store.entries}
    />
  );
}
