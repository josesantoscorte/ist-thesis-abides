def policy_rate_update(previous_rate, inflation_proxy, unemployment_rate, neutral_rate):
  inflation_gap = inflation_proxy
  employment_gap = max(0.0, unemployment_rate - 0.05)
  next_rate = neutral_rate + (1.2 * inflation_gap) + (0.5 * employment_gap)
  return max(0.0, 0.7 * previous_rate + 0.3 * next_rate)

