import argparse
import os

import pandas as pd


TRACKED_EVENTS = {
  "WAGE_PAYMENT_RECEIVED": "wages_paid_cents",
  "GOODS_CONSUMED": "consumption_spend_cents",
  "TRANSFER_RECEIVED": "transfers_cents",
  "PRODUCTION": "production_units"
}


def _extract_value(event_type, payload):
  if event_type == "WAGE_PAYMENT_RECEIVED":
    return int(payload.get("gross_cents", 0))
  if event_type == "GOODS_CONSUMED":
    return int(payload.get("spent_cents", 0))
  if event_type == "TRANSFER_RECEIVED":
    if isinstance(payload, dict):
      return int(payload.get("amount_cents", 0))
    return int(payload)
  if event_type == "PRODUCTION":
    return int(payload.get("produced", 0))
  return 0


def main():
  parser = argparse.ArgumentParser(description='Build time-series aggregates from agent logs.')
  parser.add_argument('-l', '--log_dir', required=True, help='Path to run log directory.')
  parser.add_argument('-o', '--output', default='timeseries.csv', help='Output CSV filename.')
  args = parser.parse_args()

  rows = []
  for filename in os.listdir(args.log_dir):
    if not filename.endswith('.bz2'):
      continue
    if filename.startswith('summary_log') or filename.startswith('ORDERBOOK_'):
      continue
    path = os.path.join(args.log_dir, filename)
    df = pd.read_pickle(path, compression='bz2')
    if 'EventType' not in df.columns or 'Event' not in df.columns:
      continue
    tracked = df[df['EventType'].isin(TRACKED_EVENTS.keys())]
    for ts, row in tracked.iterrows():
      event_type = row['EventType']
      payload = row['Event'] if isinstance(row['Event'], dict) else {}
      if event_type == 'TRANSFER_RECEIVED' and not isinstance(row['Event'], dict):
        payload = row['Event']
      rows.append({
        "timestamp": ts,
        "series": TRACKED_EVENTS[event_type],
        "value": _extract_value(event_type, payload)
      })

  if not rows:
    print("No tracked events found in {}".format(args.log_dir))
    return

  out = pd.DataFrame(rows)
  out = out.groupby(["timestamp", "series"], as_index=False)["value"].sum()
  pivot = out.pivot(index="timestamp", columns="series", values="value").fillna(0).sort_index()
  output_path = os.path.join(args.log_dir, args.output)
  pivot.to_csv(output_path)
  print("Wrote {}".format(output_path))


if __name__ == '__main__':
  main()

