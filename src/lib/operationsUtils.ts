import { OperationContract } from './types';

/** Amount for a single contract in a given month (override or default). */
export function opAmount(c: OperationContract, month: string): number {
  return c.monthlyOverrides[month] ?? c.defaultMonthlyAmount;
}

/** Total income across all contracts for a set of months. */
export function totalOpsIncome(
  contracts: OperationContract[],
  months: string[]
): number {
  return months.reduce(
    (sum, month) => sum + contracts.reduce((s, c) => s + opAmount(c, month), 0),
    0
  );
}

/** Set of task strings that belong to at least one operation contract. */
export function buildOpTicketSet(contracts: OperationContract[]): Set<string> {
  return new Set(contracts.flatMap(c => c.ticketIds));
}
