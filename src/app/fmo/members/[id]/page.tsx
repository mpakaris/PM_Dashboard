import { getFmoData } from '@/actions/fmo';
import { notFound } from 'next/navigation';
import MemberDetailClient from './MemberDetailClient';

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { store, mappings } = await getFmoData();
  const member = mappings.members[id];
  if (!member) notFound();
  const memberEntries = store.entries.filter((e) => e.user === member.name);
  return <MemberDetailClient member={member} entries={memberEntries} subCategories={mappings.subCategories} />;
}
