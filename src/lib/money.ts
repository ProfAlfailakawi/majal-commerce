/**
 * Kuwaiti dinar formatting. KWD has three decimals (1 د.ك = 1000 fils); every amount the
 * platform shows goes through here so rounding and the currency label are consistent.
 */
const formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const formatKwd = (kwd: number) => `${formatter.format(Number.isFinite(kwd) ? kwd : 0)} د.ك`;
export const formatFils = (fils: number) => formatKwd((Number.isFinite(fils) ? fils : 0) / 1000);
export const kwdToFils = (kwd: number) => Math.round(kwd * 1000);
