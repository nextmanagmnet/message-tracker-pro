// Detects the order-confirmation message the business sends to a customer ("ORDER CONFIRMED ... Total: 45 USD")
// and reads the order value out of it. The marker is per client (clients.order_marker).

export const DEFAULT_ORDER_MARKER = "ORDER CONFIRMED";

const DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const CURRENCY: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP", "ر.س": "SAR", "ريال": "SAR", "ر.س.": "SAR", "دولار": "USD" };
const TOTAL = /(?:total|amount|sum|المجموع|الإجمالي|الاجمالي|المبلغ)\s*[:：=-]?\s*(\$|€|£)?\s*([\d.,]+)\s*([A-Za-z]{3}\b|\$|€|£|ر\.?س\.?|ريال|دولار)?/i;

export const isOrderMessage = (text: string, marker: string | null) =>
  Boolean(marker?.trim()) && text.toLowerCase().includes(marker!.trim().toLowerCase());

export function parseOrder(text: string): { value: number | null; currency: string | null } {
  const m = text.replace(/[٠-٩]/g, (d) => DIGITS[d]).match(TOTAL);
  if (!m) return { value: null, currency: null };
  const value = Number(m[2].replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  const raw = m[1] ?? m[3] ?? "";
  const currency = CURRENCY[raw] ?? (/^[A-Za-z]{3}$/.test(raw) ? raw.toUpperCase() : null);
  return { value: Number.isFinite(value) && value > 0 ? value : null, currency };
}
