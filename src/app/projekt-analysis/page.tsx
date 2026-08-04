import { readProjektAnalysis } from '@/lib/db';
import ProjektAnalysisClient from './ProjektAnalysisClient';

export default async function ProjektAnalysisPage() {
  const projects = await readProjektAnalysis();
  return <ProjektAnalysisClient projects={projects} />;
}
