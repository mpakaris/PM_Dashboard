import { initFmoWbsIfEmpty, getFmoMappings } from '@/actions/fmo';
import WbsClient from './WbsClient';

export default async function WbsPage() {
  await initFmoWbsIfEmpty();
  const mappings = await getFmoMappings();
  return (
    <WbsClient
      wbsEntries={Object.values(mappings.wbs)}
      subCategories={mappings.subCategories}
    />
  );
}
