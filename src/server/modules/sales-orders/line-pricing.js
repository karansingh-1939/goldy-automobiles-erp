function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

export function calculateLinePricing(qty, price, discountVal, gstRate, taxType) {
  const quantity = Number(qty || 0);
  const unitPrice = Number(price || 0);
  const discount = Number(discountVal || 0);
  const rate = Number(gstRate || 0);

  let lineSubtotal = 0;
  let lineGst = 0;
  let lineTotal = 0;

  if (taxType === 'INCLUSIVE') {
    const rawLineTotal = quantity * unitPrice;
    const discountedLineTotal = Math.max(0, rawLineTotal - discount);

    lineSubtotal = discountedLineTotal / (1 + rate / 100);
    lineGst = discountedLineTotal - lineSubtotal;
    lineTotal = discountedLineTotal;
  } else {
    const rawLineSubtotal = quantity * unitPrice;
    const discountedLineSubtotal = Math.max(0, rawLineSubtotal - discount);

    lineSubtotal = discountedLineSubtotal;
    lineGst = discountedLineSubtotal * (rate / 100);
    lineTotal = discountedLineSubtotal + lineGst;
  }

  return {
    subtotal: roundMoney(lineSubtotal),
    gst: roundMoney(lineGst),
    total: roundMoney(lineTotal),
  };
}
