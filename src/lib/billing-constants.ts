/** Amount charged via Razorpay in the smallest currency unit (paise for INR). */
export const PRO_AMOUNT =
  Number(process.env.RAZORPAY_PRO_AMOUNT ?? "99900") || 99900;

export const PRO_CURRENCY = process.env.RAZORPAY_CURRENCY ?? "INR";

/** Shown on the pricing page — matches the design. */
export const PRO_PRICE_LABEL =
  process.env.NEXT_PUBLIC_PRO_PRICE_LABEL ?? "$10 / month";

/** Paid Pro access lasts this many days per successful checkout. */
export const PRO_DURATION_DAYS =
  Number(process.env.PRO_DURATION_DAYS ?? "30") || 30;
