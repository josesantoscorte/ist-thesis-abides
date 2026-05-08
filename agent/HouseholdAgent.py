from message.Message import Message
from policy.fiscal import income_tax_due
from policy.automation import effective_retraining

from agent.EconomicAgent import EconomicAgent


class HouseholdAgent(EconomicAgent):
  def __init__(self, id, name, random_state, firm_ids, government_id, wake_interval_ns, initial_cash_cents=250000,
               consumption_propensity=0.35, retraining_subsidy=0.0, log_to_file=True):
    super().__init__(id=id, name=name, type="HouseholdAgent", random_state=random_state,
                     wake_interval_ns=wake_interval_ns, log_to_file=log_to_file)
    self.firm_ids = list(firm_ids)
    self.government_id = government_id
    self.cash_cents = int(initial_cash_cents)
    self.consumption_propensity = float(consumption_propensity)
    self.retraining_subsidy = float(retraining_subsidy)
    self.skill = 0.4
    self.employer_id = None
    self.current_wage_cents = 0
    self.is_unemployed = True
    self.last_tax_rate = 0.0

  def wakeup(self, currentTime):
    super().wakeup(currentTime)
    if self.is_unemployed and self.firm_ids:
      target = int(self.random_state.choice(self.firm_ids))
      self.sendMessage(target, Message({"msg": "LABOR_APPLICATION", "sender": self.id, "skill": self.skill}))
      self.sendMessage(self.government_id, Message({"msg": "BENEFITS_REQUEST", "sender": self.id}))

    if self.firm_ids and self.cash_cents > 0:
      budget = int(self.cash_cents * self.consumption_propensity)
      if budget > 0:
        quantity = max(1, budget // 100)
        target = int(self.random_state.choice(self.firm_ids))
        self.sendMessage(target, Message({"msg": "CONSUMER_DEMAND", "sender": self.id, "quantity": quantity, "budget": budget}))

    self.schedule_next_wake()

  def receiveMessage(self, currentTime, msg):
    super().receiveMessage(currentTime, msg)
    msg_type = msg.body.get("msg")
    if msg_type == "JOB_OFFER":
      self.employer_id = msg.body["firm_id"]
      self.current_wage_cents = int(msg.body["wage_cents"])
      self.is_unemployed = False
      self.sendMessage(self.government_id, Message({"msg": "EMPLOYMENT_STATUS", "sender": self.id, "is_unemployed": False}))
      self.logEvent("EMPLOYED", {"firm_id": self.employer_id, "wage_cents": self.current_wage_cents})
    elif msg_type == "WAGE_PAYMENT":
      gross = int(msg.body["amount_cents"])
      self.cash_cents += gross
      taxes = income_tax_due(gross, self.last_tax_rate)
      if taxes > 0:
        self.cash_cents -= taxes
        self.sendMessage(self.government_id, Message({"msg": "TAX_PAYMENT", "sender": self.id, "amount_cents": taxes}))
      self.logEvent("WAGE_PAYMENT_RECEIVED", {"gross_cents": gross, "taxes_cents": taxes})
    elif msg_type == "TRANSFER_PAYMENT":
      transfer = int(msg.body["amount_cents"])
      self.cash_cents += transfer
      self.logEvent("TRANSFER_RECEIVED", transfer)
    elif msg_type == "GOODS_FILLED":
      spent = int(msg.body["spent_cents"])
      qty = int(msg.body["quantity_filled"])
      self.cash_cents = max(0, self.cash_cents - spent)
      self.logEvent("GOODS_CONSUMED", {"spent_cents": spent, "quantity": qty})
    elif msg_type == "POLICY_UPDATE":
      self.last_tax_rate = float(msg.body.get("income_tax_rate", self.last_tax_rate))
      subsidy = float(msg.body.get("retraining_subsidy", self.retraining_subsidy))
      self.skill = effective_retraining(subsidy, self.skill)
      self.retraining_subsidy = subsidy
      self.logEvent("HOUSEHOLD_POLICY_UPDATED", {"tax_rate": self.last_tax_rate, "skill": self.skill})
    elif msg_type == "EMPLOYMENT_TERMINATED":
      self.employer_id = None
      self.current_wage_cents = 0
      self.is_unemployed = True
      self.sendMessage(self.government_id, Message({"msg": "EMPLOYMENT_STATUS", "sender": self.id, "is_unemployed": True}))
      self.logEvent("UNEMPLOYED", "")

  def kernelStopping(self):
    super().kernelStopping()
    self.logEvent("HOUSEHOLD_FINAL_STATE",
                  {"cash_cents": self.cash_cents, "is_unemployed": self.is_unemployed, "skill": self.skill},
                  appendSummaryLog=True)

