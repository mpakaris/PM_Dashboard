import { getFmoData } from '@/actions/fmo';
import MembersClient from './MembersClient';

export default async function MembersPage() {
  const { store, mappings } = await getFmoData();
  return <MembersClient members={Object.values(mappings.members)} entries={store.entries} />;
}
