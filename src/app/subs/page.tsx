import { readSubContractors, readElsap, readInvoicing } from '@/lib/db';
import SubsClient from './SubsClient';

export default async function SubsPage() {
  const [subStore, mirror, invoicingStore] = await Promise.all([
    readSubContractors(),
    readElsap(),
    readInvoicing(),
  ]);
  return <SubsClient subStore={subStore} mirror={mirror} invoicingStore={invoicingStore} />;
}
