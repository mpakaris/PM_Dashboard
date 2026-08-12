import { getFmoData } from '@/actions/fmo';
import UtilizationClient from './UtilizationClient';

export default async function UtilizationPage() {
  const { store, mappings } = await getFmoData();
  return (
    <UtilizationClient
      entries={store.entries}
      members={mappings.members}
      subCategories={mappings.subCategories}
    />
  );
}
