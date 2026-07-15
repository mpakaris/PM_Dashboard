import { readTimesheets } from '@/lib/db';
import TimesheetsClient from './TimesheetsClient';

export default async function TimesheetsPage() {
  const store = await readTimesheets();
  return <TimesheetsClient store={store} />;
}
