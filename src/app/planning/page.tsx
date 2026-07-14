import { readData } from '@/lib/db';
import PlanningClient from './PlanningClient';

export default async function PlanningPage() {
  const data = await readData();
  return (
    <PlanningClient
      forecasts={data.forecasts}
    />
  );
}
