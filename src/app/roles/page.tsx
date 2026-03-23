import { readData } from '@/lib/db';
import RolesClient from './RolesClient';

export default async function RolesPage() {
  const data = readData();
  return <RolesClient roles={data.roles} />;
}
