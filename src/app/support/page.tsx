import { readSupport } from '@/lib/db';
import SupportClient from './SupportClient';

export default async function SupportPage() {
  const store = await readSupport();
  return <SupportClient store={store} />;
}
