import { getFmoData } from '@/actions/fmo';
import ImportClient from './ImportClient';

export default async function ImportPage() {
  const { store } = await getFmoData();
  return <ImportClient store={store} />;
}
