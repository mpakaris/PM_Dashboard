export interface ChartDescriptor {
  id: string;
  titleKey: string;          // key in messages/en.json charts.*
  defaultWidth: 'half' | 'full';
  defaultVisible: boolean;
  pages: string[];
}

export const CHART_REGISTRY: ChartDescriptor[] = [
  // ─── Project Analysis ──────────────────────────────────────────────────────
  { id: 'pa-devops',           titleKey: 'devOps',           defaultWidth: 'full', defaultVisible: true,  pages: ['projekt-analysis'] },
  { id: 'pa-velocity',         titleKey: 'velocity',         defaultWidth: 'half', defaultVisible: true,  pages: ['projekt-analysis'] },
  { id: 'pa-team-composition', titleKey: 'teamComposition',  defaultWidth: 'half', defaultVisible: true,  pages: ['projekt-analysis'] },
  { id: 'pa-monthly-ticket',   titleKey: 'monthlyByTicket',  defaultWidth: 'half', defaultVisible: true,  pages: ['projekt-analysis'] },
  { id: 'pa-monthly-user',     titleKey: 'monthlyByUser',    defaultWidth: 'half', defaultVisible: true,  pages: ['projekt-analysis'] },
  { id: 'pa-activity-split',   titleKey: 'activitySplit',    defaultWidth: 'full', defaultVisible: true,  pages: ['projekt-analysis'] },
  { id: 'pa-billing',          titleKey: 'billing',          defaultWidth: 'half', defaultVisible: false, pages: ['projekt-analysis'] },
  { id: 'pa-economics',        titleKey: 'economics',        defaultWidth: 'half', defaultVisible: false, pages: ['projekt-analysis'] },
  { id: 'pa-cumulative',       titleKey: 'cumulative',       defaultWidth: 'full', defaultVisible: true,  pages: ['projekt-analysis'] },
  { id: 'pa-forecast-burnup',  titleKey: 'forecastBurnup',   defaultWidth: 'half', defaultVisible: true,  pages: ['projekt-analysis'] },
  { id: 'pa-ticket-progress',  titleKey: 'ticketProgress',   defaultWidth: 'half', defaultVisible: true,  pages: ['projekt-analysis'] },
];

export function chartsForPage(pageId: string): ChartDescriptor[] {
  return CHART_REGISTRY.filter(c => c.pages.includes(pageId));
}
