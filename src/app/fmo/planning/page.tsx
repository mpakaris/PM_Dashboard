import { getFmoForecasts } from '@/actions/fmoPlanning';
import { getFmoProjects } from '@/actions/fmoProjects';
import PlanningListClient from './PlanningListClient';

export default async function FmoPlanningPage() {
  const [forecasts, projects] = await Promise.all([getFmoForecasts(), getFmoProjects()]);
  return <PlanningListClient forecasts={forecasts} projects={projects} />;
}
