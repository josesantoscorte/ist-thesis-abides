def debt_service_due(principal_cents, policy_rate):
  return max(0, int(round(principal_cents * max(0.0, policy_rate))))


def loan_decision(request_cents, borrower_cash_cents, bank_reserves_cents, risk_tolerance):
  if request_cents <= 0:
    return False
  liquidity_ok = bank_reserves_cents >= request_cents
  leverage_ratio = request_cents / float(max(1, borrower_cash_cents))
  risk_ok = leverage_ratio <= max(0.1, risk_tolerance)
  return liquidity_ok and risk_ok

