#!/bin/bash

seed=123456789
config=baseline
log=baseline

python3 -u abides.py -c $config -l $log -s $seed \
  --households 120 \
  --firms 15 \
  --months 18 \
  --wake_hours 24 \
  --automation_adoption_rate 0.02 \
  --task_substitution_elasticity 0.30 \
  --productivity_gain_factor 0.45 \
  --labor_displacement_lag 3 \
  --income_tax_rate 0.18 \
  --unemployment_support 9000 \
  --retraining_subsidy 0.03 \
  --neutral_rate 0.02

