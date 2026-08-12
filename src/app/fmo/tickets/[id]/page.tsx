import { getFmoData } from '@/actions/fmo';
import { notFound } from 'next/navigation';
import TicketDetailClient from './TicketDetailClient';

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (isNaN(ticketId)) notFound();

  const { store, mappings } = await getFmoData();
  const ticket = mappings.tickets[String(ticketId)];
  if (!ticket) notFound();

  const ticketEntries = store.entries.filter(e => e.ticketId === ticketId);

  return (
    <TicketDetailClient
      ticket={ticket}
      entries={ticketEntries}
      members={mappings.members}
      wbs={mappings.wbs}
    />
  );
}
