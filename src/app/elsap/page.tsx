import { readElsap } from '@/lib/db';
import ElsapClient from './ElsapClient';

export default async function ElsapPage() {
  const mirror = await readElsap();
  return <ElsapClient mirror={mirror} />;
}
