import { initFmoWbsIfEmpty, getFmoData } from '@/actions/fmo';
import WbsClient from './WbsClient';

export default async function WbsPage() {
  await initFmoWbsIfEmpty();
  const { store, mappings } = await getFmoData();
  return (
    <WbsClient
      wbsEntries={Object.values(mappings.wbs)}
      subCategories={mappings.subCategories}
      tickets={Object.values(mappings.tickets)}
      entries={store.entries}
    />
  );
}
