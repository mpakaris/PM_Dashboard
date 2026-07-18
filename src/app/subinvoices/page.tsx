import { readSubContractors, readElsap, readData, readInvoicing } from '@/lib/db';
import SubInvoicesClient from './SubInvoicesClient';

export default async function SubInvoicesPage() {
  const [subStore, mirror, appData, invoicingStore] = await Promise.all([
    readSubContractors(),
    readElsap(),
    readData(),
    readInvoicing(),
  ]);
  return (
    <SubInvoicesClient
      subStore={subStore}
      mirror={mirror}
      appData={appData}
      invoicingStore={invoicingStore}
    />
  );
}
