import { readData } from '@/lib/db';
import ProfilesClient from './ProfilesClient';

export default async function ProfilesPage() {
  const data = await readData();
  return <ProfilesClient profiles={data.profiles} />;
}
