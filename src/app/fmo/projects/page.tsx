import { getFmoProjects } from '@/actions/fmoProjects';
import { getFmoData } from '@/actions/fmo';
import { entryBelongsToProject, opsContractActiveInMonth, rateAtMonth, fpImpliedRate } from '@/lib/utils';
import ProjectsClient from './ProjectsClient';

export type ProjectFinancials = {
  dev:   { cost: number; revenue: number; hours: number };
  admin: { cost: number; hours: number };
  ops:   { cost: number; revenue: number; hours: number };
  total: { cost: number; revenue: number };
};

export default async function FmoProjectsPage() {
  const [projects, { store, mappings }] = await Promise.all([
    getFmoProjects(),
    getFmoData(),
  ]);

  // name → member for cost/billing rate lookups
  const nameToMember = Object.fromEntries(
    Object.values(mappings.members).map(m => [m.name, m])
  );

  const financials: Record<string, ProjectFinancials> = {};

  for (const project of projects) {
    const projectEntries = store.entries.filter(e => entryBelongsToProject(e, project));
    if (projectEntries.length === 0) continue;

    const allOpsSet       = new Set((project.operationContracts ?? []).flatMap(c => c.ticketIds));
    const fixOpsSet       = new Set(
      (project.operationContracts ?? []).filter(c => c.type === 'fixprice').flatMap(c => c.ticketIds)
    );
    const fixOpsContracts = (project.operationContracts ?? []).filter(c => c.type === 'fixprice');

    let devCost = 0, devRevenue = 0, devHours = 0;
    let adminCost = 0, adminHours = 0;
    let opsCost = 0, opsHourlyRevenue = 0, opsHours = 0;

    for (const e of projectEntries) {
      const member      = nameToMember[e.user];
      const costRate    = member ? rateAtMonth(member.costRate, member.costRateHistory, e.month) : 0;
      const _mRate      = member ? (project.memberRates ?? {})[member.id] : undefined;
      const billingRate = project.projectType === 'fixprice'
        ? fpImpliedRate(project)
        : (_mRate ? rateAtMonth(_mRate.billingRate, _mRate.billingRateHistory, e.month) : 0);
      const isOps       = e.ticketId !== null && allOpsSet.has(e.ticketId);

      if (isOps) {
        opsCost  += e.spentTime * costRate;
        opsHours += e.spentTime;
        // Hourly ops contracts bill per hour at the member's project billing rate
        if (e.ticketId !== null && !fixOpsSet.has(e.ticketId)) {
          opsHourlyRevenue += e.spentTime * billingRate;
        }
      } else if (e.billingClass === 'I') {
        adminCost  += e.spentTime * costRate;
        adminHours += e.spentTime;
      } else {
        // Development: V-class + unclassified non-ops entries
        devCost    += e.spentTime * costRate;
        devRevenue += e.spentTime * billingRate;
        devHours   += e.spentTime;
      }
    }

    // Fixprice ops revenue = monthly flat fees, only within each contract's active date range
    const months = [...new Set(projectEntries.map(e => e.month))];
    const fixOpsRevenue = months.reduce((sum, month) =>
      sum + fixOpsContracts.reduce((cs, c) => opsContractActiveInMonth(c, month)
        ? cs + ((c.monthlyOverrides ?? {})[month] ?? c.defaultMonthlyAmount)
        : cs, 0), 0);

    const opsRevenue = fixOpsRevenue + opsHourlyRevenue;

    financials[project.id] = {
      dev:   { cost: Math.round(devCost),   revenue: Math.round(devRevenue),  hours: Math.round(devHours   * 10) / 10 },
      admin: { cost: Math.round(adminCost), hours: Math.round(adminHours * 10) / 10 },
      ops:   { cost: Math.round(opsCost),   revenue: Math.round(opsRevenue),  hours: Math.round(opsHours   * 10) / 10 },
      total: { cost: Math.round(devCost + adminCost + opsCost), revenue: Math.round(devRevenue + opsRevenue) },
    };
  }

  return (
    <ProjectsClient
      projects={projects}
      wbsEntries={mappings.wbs}
      tickets={mappings.tickets}
      financials={financials}
    />
  );
}
