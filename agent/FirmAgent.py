from message.Message import Message

from agent.EconomicAgent import EconomicAgent
from model import output_units, desired_labor_demand, wage_offer
from policy.automation import automation_delta


class FirmAgent(EconomicAgent):
  def __init__(self, id, name, random_state, household_ids, bank_id, government_id, wake_interval_ns,
               base_wage_cents=25000, base_productivity=4.0, starting_cash_cents=1500000, initial_price_cents=100,
               base_headcount=10, automation_adoption_rate=0.01, task_substitution_elasticity=0.25,
               productivity_gain_factor=0.4, labor_displacement_lag=2, log_to_file=True):
    super().__init__(id=id, name=name, type="FirmAgent", random_state=random_state,
                     wake_interval_ns=wake_interval_ns, log_to_file=log_to_file)
    self.household_ids = list(household_ids)
    self.bank_id = bank_id
    self.government_id = government_id
    self.base_wage_cents = int(base_wage_cents)
    self.base_productivity = float(base_productivity)
    self.cash_cents = int(starting_cash_cents)
    self.price_cents = int(initial_price_cents)
    self.base_headcount = int(base_headcount)
    self.automation_adoption_rate = float(automation_adoption_rate)
    self.task_substitution_elasticity = float(task_substitution_elasticity)
    self.productivity_gain_factor = float(productivity_gain_factor)
    self.labor_displacement_lag = max(1, int(labor_displacement_lag))
    self.automation_level = 0.0
    self.employees = set()
    self.inventory_units = 0
    self.debt_cents = 0
    self.step_count = 0
    self.last_interest_rate = 0.02
    self.pending_hires = {}

  def wakeup(self, currentTime):
    super().wakeup(currentTime)
    self.step_count += 1

    self.automation_level = automation_delta(self.automation_level, self.automation_adoption_rate)
    desired_workers = desired_labor_demand(self.base_headcount, self.automation_level, self.task_substitution_elasticity)

    if self.step_count % self.labor_displacement_lag == 0 and len(self.employees) > desired_workers:
      excess = len(self.employees) - desired_workers
      laid_off = list(self.employees)[:excess]
      for worker_id in laid_off:
        self.employees.remove(worker_id)
        self.sendMessage(worker_id, Message({"msg": "EMPLOYMENT_TERMINATED", "sender": self.id}))
      self.logEvent("LAYOFFS", {"count": len(laid_off), "desired_workers": desired_workers})

    workers = len(self.employees)
    produced = output_units(workers, self.base_productivity, self.automation_level, self.productivity_gain_factor)
    self.inventory_units += produced
    self.logEvent("PRODUCTION", {"workers": workers, "produced": produced, "inventory": self.inventory_units})

    for worker_id in list(self.employees):
      wage = wage_offer(self.base_wage_cents, self.base_productivity, self.automation_level, labor_tightness=0.1)
      if self.cash_cents >= wage:
        self.cash_cents -= wage
        self.sendMessage(worker_id, Message({"msg": "WAGE_PAYMENT", "sender": self.id, "amount_cents": wage}))
      else:
        self.sendMessage(worker_id, Message({"msg": "EMPLOYMENT_TERMINATED", "sender": self.id}))
        self.employees.remove(worker_id)

    if self.cash_cents < 200000:
      request = max(50000, 400000 - self.cash_cents)
      self.sendMessage(self.bank_id, Message({"msg": "LOAN_REQUEST", "sender": self.id, "amount_cents": request,
                                              "cash_cents": self.cash_cents}))

    self.sendMessage(self.government_id, Message({"msg": "FIRM_STATUS", "sender": self.id, "cash_cents": self.cash_cents,
                                                  "employees": len(self.employees), "automation_level": self.automation_level}))
    self.schedule_next_wake()

  def receiveMessage(self, currentTime, msg):
    super().receiveMessage(currentTime, msg)
    msg_type = msg.body.get("msg")
    if msg_type == "LABOR_APPLICATION":
      applicant = msg.body["sender"]
      desired_workers = desired_labor_demand(self.base_headcount, self.automation_level, self.task_substitution_elasticity)
      if len(self.employees) < desired_workers and applicant not in self.employees:
        offer = wage_offer(self.base_wage_cents, self.base_productivity, self.automation_level, labor_tightness=0.2)
        self.pending_hires[applicant] = offer
        self.sendMessage(applicant, Message({"msg": "JOB_OFFER", "sender": self.id, "firm_id": self.id, "wage_cents": offer}))
        self.employees.add(applicant)
    elif msg_type == "CONSUMER_DEMAND":
      quantity_requested = max(0, int(msg.body.get("quantity", 0)))
      budget = max(0, int(msg.body.get("budget", 0)))
      fill_qty = min(quantity_requested, self.inventory_units, max(0, budget // max(1, self.price_cents)))
      spent = fill_qty * self.price_cents
      self.inventory_units -= fill_qty
      self.cash_cents += spent
      self.sendMessage(msg.body["sender"], Message({"msg": "GOODS_FILLED", "sender": self.id,
                                                    "quantity_filled": fill_qty, "spent_cents": spent}))
    elif msg_type == "LOAN_DECISION":
      approved = bool(msg.body["approved"])
      amount = int(msg.body["amount_cents"])
      if approved:
        self.cash_cents += amount
        self.debt_cents += amount
      self.logEvent("LOAN_DECISION", {"approved": approved, "amount_cents": amount})
    elif msg_type == "DEBT_SERVICE_DUE":
      due = int(msg.body["amount_cents"])
      pay = min(self.cash_cents, due)
      self.cash_cents -= pay
      self.debt_cents = max(0, self.debt_cents - pay)
      self.sendMessage(self.bank_id, Message({"msg": "DEBT_SERVICE_PAYMENT", "sender": self.id, "amount_cents": pay}))
    elif msg_type == "POLICY_UPDATE":
      self.automation_adoption_rate = float(msg.body.get("automation_adoption_rate", self.automation_adoption_rate))
      self.logEvent("FIRM_POLICY_UPDATED", {"automation_adoption_rate": self.automation_adoption_rate})
    elif msg_type == "INTEREST_RATE_UPDATE":
      self.last_interest_rate = float(msg.body["policy_rate"])

  def kernelStopping(self):
    super().kernelStopping()
    self.logEvent("FIRM_FINAL_STATE",
                  {"cash_cents": self.cash_cents, "debt_cents": self.debt_cents, "employees": len(self.employees),
                   "automation_level": self.automation_level},
                  appendSummaryLog=True)

