import { getFmoData } from '@/actions/fmo';
import TicketsClient from './TicketsClient';

export default async function TicketsPage() {
  const { store, mappings } = await getFmoData();
  return (
    <TicketsClient
      tickets={Object.values(mappings.tickets)}
      wbsEntries={mappings.wbs}
      entries={store.entries}
    />
  );
}
