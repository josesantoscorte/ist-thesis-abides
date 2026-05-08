import argparse
import json
import os

import pandas as pd


def _parse_summary_event(value):
  if isinstance(value, dict):
    return value
  return {}


def main():
  parser = argparse.ArgumentParser(description='Compute summary metrics from a baseline run.')
  parser.add_argument('-l', '--log_dir', required=True, help='Path to run log directory.')
  args = parser.parse_args()

  summary_path = os.path.join(args.log_dir, 'summary_log.bz2')
  if not os.path.exists(summary_path):
    raise FileNotFoundError("summary_log.bz2 not found in {}".format(args.log_dir))

  summary = pd.read_pickle(summary_path, compression='bz2')
  households = summary[summary['EventType'] == 'HOUSEHOLD_FINAL_STATE']['Event'].apply(_parse_summary_event)
  firms = summary[summary['EventType'] == 'FIRM_FINAL_STATE']['Event'].apply(_parse_summary_event)
  banks = summary[summary['EventType'] == 'BANK_FINAL_STATE']['Event'].apply(_parse_summary_event)
  governments = summary[summary['EventType'] == 'GOVERNMENT_FINAL_STATE']['Event'].apply(_parse_summary_event)
  rates = summary[summary['EventType'] == 'POLICY_RATE_SET']['Event'].apply(_parse_summary_event)

  household_rows = [x for x in households if x]
  firm_rows = [x for x in firms if x]
  bank_rows = [x for x in banks if x]
  gov_rows = [x for x in governments if x]
  rate_rows = [x for x in rates if x]

  total_households = len(household_rows)
  unemployed = sum(1 for x in household_rows if x.get('is_unemployed', False))
  unemployment_rate = (unemployed / float(total_households)) if total_households else 0.0

  avg_household_cash = int(sum(x.get('cash_cents', 0) for x in household_rows) / float(max(1, total_households)))
  total_firm_cash = sum(x.get('cash_cents', 0) for x in firm_rows)
  avg_automation = (sum(x.get('automation_level', 0.0) for x in firm_rows) / float(max(1, len(firm_rows))))
  active_loans = sum(x.get('active_loans', 0) for x in bank_rows)
  budget = gov_rows[-1].get('budget_cents', 0) if gov_rows else 0
  policy_rate = rate_rows[-1].get('policy_rate', 0.0) if rate_rows else 0.0

  stats = {
    "log_dir": args.log_dir,
    "households": total_households,
    "unemployed_households": unemployed,
    "unemployment_rate": unemployment_rate,
    "average_household_cash_cents": avg_household_cash,
    "total_firm_cash_cents": int(total_firm_cash),
    "average_firm_automation_level": avg_automation,
    "active_loans_count": int(active_loans),
    "government_budget_cents": int(budget),
    "final_policy_rate": float(policy_rate)
  }

  manifest_path = os.path.join(args.log_dir, "scenario_manifest.json")
  if os.path.exists(manifest_path):
    with open(manifest_path, "r") as manifest_file:
      stats["scenario_manifest"] = json.load(manifest_file)

  print(json.dumps(stats, indent=2, sort_keys=True))


if __name__ == '__main__':
  main()

