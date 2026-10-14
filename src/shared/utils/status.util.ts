export type RiskStatus = 'Risk' | 'Warning' | 'Safe';

export function computeRiskStatus(
  dates: (Date | string | null | undefined)[],
): RiskStatus {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const oneMonthFromToday = new Date(today);
  oneMonthFromToday.setMonth(today.getMonth() + 1);

  let hasExpiring = false;

  for (const raw of dates) {
    if (!raw) continue;
    const date = new Date(raw);
    date.setHours(0, 0, 0, 0);

    if (date < today) {
      return 'Risk'; // one expired document is enough to short-circuit
    }
    if (date <= oneMonthFromToday) {
      hasExpiring = true;
    }
  }

  return hasExpiring ? 'Warning' : 'Safe';
}
