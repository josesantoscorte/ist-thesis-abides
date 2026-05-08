from message.Message import Message

from agent.EconomicAgent import EconomicAgent
from policy.fiscal import unemployment_benefit


class GovernmentAgent(EconomicAgent):
  def __init__(self, id, name, random_state, household_ids, firm_ids, bank_id, central_bank_id, wake_interval_ns,
               income_tax_rate=0.15, unemployment_support_cents=9000, retraining_subsidy=0.03,
               automation_adoption_rate=0.01, log_to_file=True):
    super().__init__(id=id, name=name, type="GovernmentAgent", random_state=random_state,
                     wake_interval_ns=wake_interval_ns, log_to_file=log_to_file)
    self.household_ids = list(household_ids)
    self.firm_ids = list(firm_ids)
    self.bank_id = bank_id
    self.central_bank_id = central_bank_id
    self.income_tax_rate = float(income_tax_rate)
    self.unemployment_support_cents = int(unemployment_support_cents)
    self.retraining_subsidy = float(retraining_subsidy)
    self.automation_adoption_rate = float(automation_adoption_rate)
    self.budget_cents = 0
    self.unemployed = set(household_ids)
    self.firm_status = {}
    self.policy_rate = 0.02

  def wakeup(self, currentTime):
    super().wakeup(currentTime)
    for household_id in self.household_ids:
      is_unemployed = household_id in self.unemployed
      benefit = unemployment_benefit(self.unemployment_support_cents, is_unemployed)
      if benefit > 0 and self.budget_cents >= benefit:
        self.budget_cents -= benefit
        self.sendMessage(household_id, Message({"msg": "TRANSFER_PAYMENT", "sender": self.id, "amount_cents": benefit}))

    policy_message = {
      "msg": "POLICY_UPDATE",
      "sender": self.id,
      "income_tax_rate": self.income_tax_rate,
      "retraining_subsidy": self.retraining_subsidy,
      "automation_adoption_rate": self.automation_adoption_rate
    }
    for household_id in self.household_ids:
      self.sendMessage(household_id, Message(policy_message))
    for firm_id in self.firm_ids:
      self.sendMessage(firm_id, Message(policy_message))
    self.sendMessage(self.bank_id, Message({"msg": "POLICY_UPDATE", "sender": self.id, "bank_risk_tolerance": 2.5}))

    unemployment_rate = len(self.unemployed) / float(max(1, len(self.household_ids)))
    avg_price = 100
    if self.firm_status:
      avg_price = int(sum(v.get("cash_cents", 100000) for v in self.firm_status.values()) / float(len(self.firm_status)))
      avg_price = max(1, avg_price // 10000)
    inflation_proxy = (avg_price - 100) / 100.0
    self.sendMessage(self.central_bank_id, Message({"msg": "MACRO_SIGNAL", "sender": self.id,
                                                    "unemployment_rate": unemployment_rate,
                                                    "inflation_proxy": inflation_proxy}))
    self.logEvent("GOVERNMENT_ROUND", {"budget_cents": self.budget_cents, "unemployment_rate": unemployment_rate})
    self.schedule_next_wake()

  def receiveMessage(self, currentTime, msg):
    super().receiveMessage(currentTime, msg)
    msg_type = msg.body.get("msg")
    if msg_type == "TAX_PAYMENT":
      self.budget_cents += int(msg.body["amount_cents"])
    elif msg_type == "BENEFITS_REQUEST":
      worker_id = msg.body["sender"]
      if worker_id in self.unemployed:
        benefit = unemployment_benefit(self.unemployment_support_cents, True)
        if self.budget_cents >= benefit:
          self.budget_cents -= benefit
          self.sendMessage(worker_id, Message({"msg": "TRANSFER_PAYMENT", "sender": self.id, "amount_cents": benefit}))
    elif msg_type == "EMPLOYMENT_STATUS":
      worker_id = msg.body["sender"]
      is_unemployed = bool(msg.body["is_unemployed"])
      if is_unemployed:
        self.unemployed.add(worker_id)
      else:
        self.unemployed.discard(worker_id)
    elif msg_type == "FIRM_STATUS":
      self.firm_status[msg.body["sender"]] = {
        "cash_cents": int(msg.body.get("cash_cents", 0)),
        "employees": int(msg.body.get("employees", 0)),
        "automation_level": float(msg.body.get("automation_level", 0.0))
      }
    elif msg_type == "INTEREST_RATE_UPDATE":
      self.policy_rate = float(msg.body["policy_rate"])
      self.logEvent("GOVERNMENT_RATE_UPDATE", {"policy_rate": self.policy_rate})

  def kernelStopping(self):
    super().kernelStopping()
    self.logEvent("GOVERNMENT_FINAL_STATE",
                  {"budget_cents": self.budget_cents, "unemployment_count": len(self.unemployed),
                   "income_tax_rate": self.income_tax_rate, "policy_rate": self.policy_rate},
                  appendSummaryLog=True)

