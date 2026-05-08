def wage_offer(base_wage_cents, productivity, automation_level, labor_tightness):
  scaled = base_wage_cents * (0.7 + 0.3 * productivity) * (1.0 - 0.1 * automation_level)
  adjusted = scaled * (1.0 + 0.15 * labor_tightness)
  return max(1, int(adjusted))


def desired_labor_demand(base_headcount, automation_level, task_substitution_elasticity):
  reduction = automation_level * task_substitution_elasticity
  demand = int(round(base_headcount * max(0.1, 1.0 - reduction)))
  return max(1, demand)

