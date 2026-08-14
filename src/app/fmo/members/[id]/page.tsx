import { getFmoData } from '@/actions/fmo';
import { getFmoProjects } from '@/actions/fmoProjects';
import { notFound } from 'next/navigation';
import MemberDetailClient from './MemberDetailClient';

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ store, mappings }, projects] = await Promise.all([getFmoData(), getFmoProjects()]);
  const member = mappings.members[id];
  if (!member) notFound();
  const memberEntries = store.entries.filter((e) => e.user === member.name);

  const sortedIds = Object.values(mappings.members)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(m => m.id);
  const idx     = sortedIds.indexOf(id);
  const prevId  = idx > 0 ? sortedIds[idx - 1] : null;
  const nextId  = idx < sortedIds.length - 1 ? sortedIds[idx + 1] : null;

  return (
    <MemberDetailClient
      member={member}
      entries={memberEntries}
      allEntries={store.entries}
      subCategories={mappings.subCategories ?? {}}
      wbs={mappings.wbs}
      projects={projects}
      prevId={prevId}
      nextId={nextId}
    />
  );
}
