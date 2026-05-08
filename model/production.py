def output_units(workers, base_productivity, automation_level, productivity_gain_factor):
  if workers <= 0:
    return 0
  effective_productivity = base_productivity * (1.0 + automation_level * productivity_gain_factor)
  return max(0, int(round(workers * effective_productivity)))


def inflation_proxy(previous_price, current_price):
  if previous_price <= 0:
    return 0.0
  return (current_price - previous_price) / float(previous_price)

