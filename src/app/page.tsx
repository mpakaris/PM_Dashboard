import { readData } from '@/lib/db';
import { getMonthsBetween, formatMonth, formatNumber } from '@/lib/utils';

const YEAR_MONTHS = getMonthsBetween('2026-01', '2026-12');

export default async function DashboardPage() {
  const data = await readData();

  const internCount = data.teamMembers.filter((m) => {
    const role = data.roles.find((r) => r.id === m.roleId);
    return role?.type === 'intern';
  }).length;
  const externCount = data.teamMembers.length - internCount;

  const totalOrderedHours = data.projects.reduce(
    (sum, p) => sum + p.orderAmountHours,
    0
  );
  const totalAssignedHours = data.assignments.reduce((sum, a) => {
    return sum + Object.values(a.plannedHours).reduce((s, v) => s + v, 0);
  }, 0);

  // Build overview table: member -> month -> hours
  const memberMonthHours: Record<string, Record<string, number>> = {};
  for (const member of data.teamMembers) {
    memberMonthHours[member.id] = {};
    for (const month of YEAR_MONTHS) {
      memberMonthHours[member.id][month] = 0;
    }
  }
  for (const assignment of data.assignments) {
    if (!memberMonthHours[assignment.memberId]) continue;
    const proj = data.projects.find((p) => p.id === assignment.projectId);
    if (!proj) continue;
    for (const [month, hours] of Object.entries(assignment.plannedHours)) {
      if (YEAR_MONTHS.includes(month)) {
        memberMonthHours[assignment.memberId][month] =
          (memberMonthHours[assignment.memberId][month] || 0) + hours;
      }
    }
  }

  const summaryCards = [
    {
      title: 'Team Members',
      value: data.teamMembers.length,
      sub: `${internCount} intern · ${externCount} extern`,
      color: 'bg-slate-50 border-slate-200',
      textColor: 'text-slate-700',
    },
    {
      title: 'Active Projects',
      value: data.projects.length,
      sub: 'total projects',
      color: 'bg-emerald-50 border-emerald-200',
      textColor: 'text-emerald-700',
    },
    {
      title: 'Ordered Hours',
      value: totalOrderedHours,
      sub: 'across all projects',
      color: 'bg-sky-50 border-sky-200',
      textColor: 'text-sky-700',
    },
    {
      title: 'Assigned Hours',
      value: totalAssignedHours,
      sub: 'total assigned',
      color: 'bg-amber-50 border-amber-200',
      textColor: 'text-amber-700',
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
        <p className="text-gray-500 text-sm">Resource management overview for 2026</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {summaryCards.map((card) => (
          <div
            key={card.title}
            className={`rounded-lg border p-5 ${card.color} ring-1 ring-gray-200`}
          >
            <p className="text-sm font-medium text-gray-500 mb-1">{card.title}</p>
            <p className={`text-3xl font-bold ${card.textColor}`}>{formatNumber(card.value)}</p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Overview Table */}
      <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Team Overview — 2026</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Total committed hours per member per month across all active projects
          </p>
        </div>
        {data.teamMembers.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">
            No team members yet. Add members to see the overview.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[160px]">
                    Member
                  </th>
                  {YEAR_MONTHS.map((month) => (
                    <th
                      key={month}
                      className="text-center px-2 py-3 font-medium text-gray-600 min-w-[60px]"
                    >
                      {formatMonth(month).split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.teamMembers.map((member, idx) => {
                  const role = data.roles.find((r) => r.id === member.roleId);
                  const availability = member.monthlyAvailability ?? 0;
                  return (
                    <tr
                      key={member.id}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        {member.name}
                        {role && (
                          <span className="block text-xs text-gray-400 font-normal">
                            {role.name}
                          </span>
                        )}
                      </td>
                      {YEAR_MONTHS.map((month) => {
                        const hours = memberMonthHours[member.id]?.[month] ?? 0;
                        const isOver = availability > 0 && hours > availability;
                        const isWarn = availability > 0 && hours >= availability * 0.8 && !isOver;
                        return (
                          <td
                            key={month}
                            className={`text-center px-2 py-2.5 text-xs rounded ${
                              isOver
                                ? 'bg-red-100 text-red-700 font-semibold'
                                : isWarn
                                ? 'bg-yellow-50 text-yellow-700'
                                : hours > 0
                                ? 'text-slate-700 font-medium'
                                : 'text-gray-300'
                            }`}
                          >
                            {hours > 0 ? `${hours}h` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
