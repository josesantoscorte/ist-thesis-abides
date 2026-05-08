import argparse
import datetime as dt
import json
import os
import sys

import numpy as np
import pandas as pd

from Kernel import Kernel
from util import util

from agent.HouseholdAgent import HouseholdAgent
from agent.FirmAgent import FirmAgent
from agent.BankAgent import BankAgent
from agent.GovernmentAgent import GovernmentAgent
from agent.CentralBankAgent import CentralBankAgent


parser = argparse.ArgumentParser(
    description='Baseline scenario: households, firms, bank, government, central bank.'
)

parser.add_argument('-c', '--config', required=True, help='Name of config file to execute')
parser.add_argument('-l', '--log_dir', default=None, help='Log directory name.')
parser.add_argument('-s', '--seed', type=int, default=None, help='Global random seed.')
parser.add_argument('-v', '--verbose', action='store_true', help='Enable verbose logging.')
parser.add_argument('--config_help', action='store_true', help='Print argument options for this config file')

parser.add_argument('--households', type=int, default=120, help='Number of household agents.')
parser.add_argument('--firms', type=int, default=15, help='Number of firm agents.')
parser.add_argument('--months', type=int, default=18, help='Simulation length in 30-day periods.')
parser.add_argument('--wake_hours', type=int, default=24, help='Agent wake interval in hours.')

parser.add_argument('--automation_adoption_rate', type=float, default=0.02)
parser.add_argument('--task_substitution_elasticity', type=float, default=0.30)
parser.add_argument('--productivity_gain_factor', type=float, default=0.45)
parser.add_argument('--labor_displacement_lag', type=int, default=3)

parser.add_argument('--income_tax_rate', type=float, default=0.18)
parser.add_argument('--unemployment_support', type=int, default=9000)
parser.add_argument('--retraining_subsidy', type=float, default=0.03)
parser.add_argument('--neutral_rate', type=float, default=0.02)

args, _ = parser.parse_known_args()

if args.config_help:
    parser.print_help()
    sys.exit()

seed = args.seed
if not seed:
    seed = int(pd.Timestamp.now().timestamp() * 1000000) % (2 ** 32 - 1)
np.random.seed(seed)
util.silent_mode = not args.verbose

simulation_start_time = dt.datetime.now()
print("Simulation Start Time: {}".format(simulation_start_time))
print("Configuration seed: {}\n".format(seed))

historical_date = pd.Timestamp('2035-01-01')
kernel_start_time = historical_date
kernel_stop_time = historical_date + pd.to_timedelta('{} days'.format(max(1, args.months * 30)))
wake_interval_ns = int(pd.to_timedelta('{} hours'.format(max(1, args.wake_hours))).value)

agents = []
agent_count = 0

government_id = agent_count
agent_count += 1
central_bank_id = agent_count
agent_count += 1
bank_id = agent_count
agent_count += 1

firm_ids = list(range(agent_count, agent_count + max(1, args.firms)))
agent_count += len(firm_ids)
household_ids = list(range(agent_count, agent_count + max(1, args.households)))

government = GovernmentAgent(
    id=government_id,
    name="GOVERNMENT_AGENT",
    random_state=np.random.RandomState(seed=np.random.randint(low=0, high=2 ** 32, dtype='uint64')),
    household_ids=household_ids,
    firm_ids=firm_ids,
    bank_id=bank_id,
    central_bank_id=central_bank_id,
    wake_interval_ns=wake_interval_ns,
    income_tax_rate=args.income_tax_rate,
    unemployment_support_cents=args.unemployment_support,
    retraining_subsidy=args.retraining_subsidy,
    automation_adoption_rate=args.automation_adoption_rate
)

central_bank = CentralBankAgent(
    id=central_bank_id,
    name="CENTRAL_BANK_AGENT",
    random_state=np.random.RandomState(seed=np.random.randint(low=0, high=2 ** 32, dtype='uint64')),
    bank_id=bank_id,
    government_id=government_id,
    wake_interval_ns=wake_interval_ns,
    neutral_rate=args.neutral_rate,
    initial_policy_rate=args.neutral_rate
)

bank = BankAgent(
    id=bank_id,
    name="BANK_AGENT",
    random_state=np.random.RandomState(seed=np.random.randint(low=0, high=2 ** 32, dtype='uint64')),
    firm_ids=firm_ids,
    government_id=government_id,
    wake_interval_ns=wake_interval_ns
)

firms = []
for firm_id in firm_ids:
    firms.append(
        FirmAgent(
            id=firm_id,
            name="FIRM_AGENT_{}".format(firm_id),
            random_state=np.random.RandomState(seed=np.random.randint(low=0, high=2 ** 32, dtype='uint64')),
            household_ids=household_ids,
            bank_id=bank_id,
            government_id=government_id,
            wake_interval_ns=wake_interval_ns,
            automation_adoption_rate=args.automation_adoption_rate,
            task_substitution_elasticity=args.task_substitution_elasticity,
            productivity_gain_factor=args.productivity_gain_factor,
            labor_displacement_lag=args.labor_displacement_lag
        )
    )

households = []
for household_id in household_ids:
    households.append(
        HouseholdAgent(
            id=household_id,
            name="HOUSEHOLD_AGENT_{}".format(household_id),
            random_state=np.random.RandomState(seed=np.random.randint(low=0, high=2 ** 32, dtype='uint64')),
            firm_ids=firm_ids,
            government_id=government_id,
            wake_interval_ns=wake_interval_ns,
            retraining_subsidy=args.retraining_subsidy
        )
    )

agents.extend([government, central_bank, bank])
agents.extend(firms)
agents.extend(households)

kernel = Kernel("BASELINE Kernel",
                random_state=np.random.RandomState(seed=np.random.randint(low=0, high=2 ** 32, dtype='uint64')))

pairwise_latencies = np.zeros((len(agents), len(agents)), dtype=np.int64)
custom_state = kernel.runner(
    agents=agents,
    startTime=kernel_start_time,
    stopTime=kernel_stop_time,
    agentLatency=pairwise_latencies,
    defaultComputationDelay=50,
    oracle=None,
    log_dir=args.log_dir
)

scenario_manifest = {
    "config": "baseline",
    "seed": seed,
    "log_dir": kernel.log_dir,
    "start_time": str(kernel_start_time),
    "stop_time": str(kernel_stop_time),
    "households": len(households),
    "firms": len(firms),
    "months": args.months,
    "wake_hours": args.wake_hours,
    "automation_adoption_rate": args.automation_adoption_rate,
    "task_substitution_elasticity": args.task_substitution_elasticity,
    "productivity_gain_factor": args.productivity_gain_factor,
    "labor_displacement_lag": args.labor_displacement_lag,
    "income_tax_rate": args.income_tax_rate,
    "unemployment_support": args.unemployment_support,
    "retraining_subsidy": args.retraining_subsidy,
    "neutral_rate": args.neutral_rate,
    "custom_state_keys": sorted(list(custom_state.keys()))
}

path = os.path.join(".", "log", kernel.log_dir)
if not os.path.exists(path):
    os.makedirs(path)
with open(os.path.join(path, "scenario_manifest.json"), "w") as manifest_file:
    json.dump(scenario_manifest, manifest_file, indent=2, sort_keys=True)

simulation_end_time = dt.datetime.now()
print("Simulation End Time: {}".format(simulation_end_time))
print("Time taken to run simulation: {}".format(simulation_end_time - simulation_start_time))

