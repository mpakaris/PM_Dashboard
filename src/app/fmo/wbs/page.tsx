import { initFmoWbsIfEmpty, getFmoData } from '@/actions/fmo';
import { getFmoProjects } from '@/actions/fmoProjects';
import WbsClient from './WbsClient';

export default async function WbsPage() {
  await initFmoWbsIfEmpty();
  const [{ store, mappings }, projects] = await Promise.all([getFmoData(), getFmoProjects()]);
  return (
    <WbsClient
      wbsEntries={Object.values(mappings.wbs)}
      subCategories={mappings.subCategories}
      tickets={Object.values(mappings.tickets)}
      entries={store.entries}
      members={mappings.members}
      projects={projects}
    />
  );
}
