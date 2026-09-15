const SP_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** Add clear unit and stack-value labels to a stored ledger entry for bank UI rendering. */
export function presentLedgerItem(entry) {
  const parsedValue = Number(entry.itemData?.system?.cost);
  const unitValue = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
  const parsedQuantity = Number(entry.quantity);
  const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
  const valueLabel = `${SP_FORMATTER.format(unitValue)} sp`;
  const totalValueLabel = `${SP_FORMATTER.format(unitValue * quantity)} sp`;

  return {
    ...entry,
    valueLabel,
    valueTitle: quantity > 1
      ? `${valueLabel} each · ${totalValueLabel} total`
      : `Value: ${valueLabel}`,
  };
}
