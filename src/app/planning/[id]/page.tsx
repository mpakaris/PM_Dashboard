import { notFound } from 'next/navigation';
import { readData } from '@/lib/db';
import { getFmoProjects } from '@/actions/fmoProjects';
import { getFmoData } from '@/actions/fmo';
import ForecastClient from './ForecastClient';

export default async function ForecastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, fmoProjects, { mappings }] = await Promise.all([readData(), getFmoProjects(), getFmoData()]);
  const forecast = data.forecasts.find((f) => f.id === id);
  if (!forecast) notFound();

  return (
    <ForecastClient
      forecast={forecast}
      fmoMembers={Object.values(mappings.members).sort((a, b) => a.name.localeCompare(b.name))}
      roles={data.roles}
      profiles={data.profiles}
      fmoProjects={fmoProjects}
    />
  );
}
