import { readElsap, readInvoicing } from '@/lib/db';
import InvoicingClient from './InvoicingClient';

export default async function InvoicingPage() {
  const [mirror, store] = await Promise.all([readElsap(), readInvoicing()]);
  return <InvoicingClient mirror={mirror} store={store} />;
}
