def income_tax_due(gross_income_cents, tax_rate):
  return max(0, int(round(gross_income_cents * max(0.0, tax_rate))))


def unemployment_benefit(unemployment_support_cents, is_unemployed):
  return int(unemployment_support_cents if is_unemployed else 0)

