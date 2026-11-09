import { readTimesheets, readPlanning } from '@/lib/db';
import TimesheetsClient from './TimesheetsClient';

export default async function TimesheetsPage() {
  const [store, planning] = await Promise.all([readTimesheets(), readPlanning()]);
  return <TimesheetsClient store={store} planning={planning} />;
}
