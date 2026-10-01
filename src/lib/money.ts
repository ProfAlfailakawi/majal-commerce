/**
 * Kuwaiti dinar formatting. KWD has three decimals (1 د.ك = 1000 fils); every amount the
 * platform shows goes through here so rounding and the currency label are consistent.
 */
const formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const formatKwd = (kwd: number) => `${formatter.format(Number.isFinite(kwd) ? kwd : 0)} د.ك`;
export const formatFils = (fils: number) => formatKwd((Number.isFinite(fils) ? fils : 0) / 1000);
export const kwdToFils = (kwd: number) => Math.round(kwd * 1000);

/**
 * The one definition of "total sales" and "platform fees" for the admin and
 * super-admin dashboards: completed orders only. Refunded orders never counted
 * as sales, and an order still waiting for payment has not been sold yet.
 */
export const completedOrderTotals = (orders: ReadonlyArray<{ status: string; grossAmountKwd: number; platformFeeKwd: number }>) =>
  orders.reduce(
    (acc, o) => (o.status === 'COMPLETED' ? { salesKwd: acc.salesKwd + o.grossAmountKwd, platformFeesKwd: acc.platformFeesKwd + o.platformFeeKwd } : acc),
    { salesKwd: 0, platformFeesKwd: 0 }
  );
