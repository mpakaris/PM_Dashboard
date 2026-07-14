import { notFound } from 'next/navigation';
import { readData } from '@/lib/db';
import ForecastClient from './ForecastClient';

export default async function ForecastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await readData();
  const forecast = data.forecasts.find((f) => f.id === id);
  if (!forecast) notFound();

  return (
    <ForecastClient
      forecast={forecast}
      teamMembers={data.teamMembers}
      roles={data.roles}
      profiles={data.profiles}
    />
  );
}
