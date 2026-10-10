export type Transfer = { from: string; to: string; amount: number }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Converts one expense into the trip's single settlement currency. */
export function convertAtRate(localAmount: number, rate: number) {
  return round2(localAmount * rate)
}

/**
 * Net balance per user: positive = they are owed money, negative = they owe.
 * balance = (expenses they paid) - (their shares) + (settlements they paid) - (settlements they received)
 */
export function computeBalances(
  userIds: string[],
  expenses: { amount: number; paidById: string }[],
  shares: { userId: string; amount: number }[],
  settlements: { fromUserId: string; toUserId: string; amount: number }[]
): Record<string, number> {
  const bal: Record<string, number> = {}
  for (const u of userIds) bal[u] = 0

  for (const e of expenses) {
    if (e.paidById in bal) bal[e.paidById] += e.amount
  }
  for (const s of shares) {
    if (s.userId in bal) bal[s.userId] -= s.amount
  }
  for (const st of settlements) {
    if (st.fromUserId in bal) bal[st.fromUserId] += st.amount
    if (st.toUserId in bal) bal[st.toUserId] -= st.amount
  }
  for (const u of userIds) bal[u] = round2(bal[u])
  return bal
}

/** Greedy minimal settle-up: match biggest debtor to biggest creditor. */
export function settleUp(balances: Record<string, number>): Transfer[] {
  const debtors = Object.entries(balances)
    .filter(([, v]) => v < -0.01)
    .map(([u, v]) => ({ u, v: -v }))
    .sort((a, b) => b.v - a.v)
  const creditors = Object.entries(balances)
    .filter(([, v]) => v > 0.01)
    .map(([u, v]) => ({ u, v }))
    .sort((a, b) => b.v - a.v)

  const out: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v)
    out.push({ from: debtors[i].u, to: creditors[j].u, amount: round2(amount) })
    debtors[i].v -= amount
    creditors[j].v -= amount
    if (debtors[i].v < 0.01) i++
    if (creditors[j].v < 0.01) j++
  }
  return out
}

/** Split a total across n participants exactly (in cents), no rounding drift. */
export function splitEqual(total: number, userIds: string[]): Record<string, number> {
  const n = userIds.length
  const out: Record<string, number> = {}
  if (n === 0) return out
  const totalCents = Math.round(total * 100)
  const base = Math.floor(totalCents / n)
  let remainder = totalCents - base * n
  for (const u of userIds) {
    const cents = base + (remainder > 0 ? 1 : 0)
    if (remainder > 0) remainder--
    out[u] = cents / 100
  }
  return out
}
