from message.Message import Message

from agent.EconomicAgent import EconomicAgent
from model import debt_service_due, loan_decision


class BankAgent(EconomicAgent):
  def __init__(self, id, name, random_state, firm_ids, government_id, wake_interval_ns,
               starting_reserves_cents=5000000, risk_tolerance=2.5, log_to_file=True):
    super().__init__(id=id, name=name, type="BankAgent", random_state=random_state,
                     wake_interval_ns=wake_interval_ns, log_to_file=log_to_file)
    self.firm_ids = list(firm_ids)
    self.government_id = government_id
    self.reserves_cents = int(starting_reserves_cents)
    self.risk_tolerance = float(risk_tolerance)
    self.policy_rate = 0.02
    self.loan_book = {}
    self.defaulted_loans_cents = 0

  def wakeup(self, currentTime):
    super().wakeup(currentTime)
    for firm_id, principal in list(self.loan_book.items()):
      due = debt_service_due(principal, self.policy_rate)
      if due > 0:
        self.sendMessage(firm_id, Message({"msg": "DEBT_SERVICE_DUE", "sender": self.id, "amount_cents": due}))
    self.schedule_next_wake()

  def receiveMessage(self, currentTime, msg):
    super().receiveMessage(currentTime, msg)
    msg_type = msg.body.get("msg")
    if msg_type == "LOAN_REQUEST":
      borrower_id = msg.body["sender"]
      amount = int(msg.body["amount_cents"])
      borrower_cash = int(msg.body.get("cash_cents", 1))
      approved = loan_decision(amount, borrower_cash, self.reserves_cents, self.risk_tolerance)
      if approved:
        self.reserves_cents -= amount
        self.loan_book[borrower_id] = self.loan_book.get(borrower_id, 0) + amount
      self.sendMessage(borrower_id, Message({"msg": "LOAN_DECISION", "sender": self.id,
                                             "approved": approved, "amount_cents": amount}))
      self.logEvent("LOAN_REQUEST_PROCESSED", {"borrower": borrower_id, "approved": approved, "amount_cents": amount})
    elif msg_type == "DEBT_SERVICE_PAYMENT":
      payer = msg.body["sender"]
      amount = int(msg.body["amount_cents"])
      self.reserves_cents += amount
      outstanding = self.loan_book.get(payer, 0)
      self.loan_book[payer] = max(0, outstanding - amount)
    elif msg_type == "INTEREST_RATE_UPDATE":
      self.policy_rate = float(msg.body["policy_rate"])
      self.logEvent("BANK_RATE_UPDATE", {"policy_rate": self.policy_rate})
    elif msg_type == "FIRM_DEFAULT":
      defaulted = int(msg.body.get("amount_cents", 0))
      self.defaulted_loans_cents += defaulted
      self.reserves_cents = max(0, self.reserves_cents - defaulted)
    elif msg_type == "POLICY_UPDATE":
      self.risk_tolerance = float(msg.body.get("bank_risk_tolerance", self.risk_tolerance))

  def kernelStopping(self):
    super().kernelStopping()
    self.logEvent("BANK_FINAL_STATE",
                  {"reserves_cents": self.reserves_cents, "active_loans": len([v for v in self.loan_book.values() if v > 0]),
                   "defaulted_loans_cents": self.defaulted_loans_cents},
                  appendSummaryLog=True)

