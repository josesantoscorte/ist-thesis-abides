def automation_delta(current_level, adoption_rate):
  new_level = current_level + max(0.0, adoption_rate)
  return min(1.0, new_level)


def effective_retraining(retraining_subsidy, worker_skill):
  return min(1.0, worker_skill + retraining_subsidy)

