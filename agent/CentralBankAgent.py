from message.Message import Message

from agent.EconomicAgent import EconomicAgent
from policy.monetary import policy_rate_update


class CentralBankAgent(EconomicAgent):
  def __init__(self, id, name, random_state, bank_id, government_id, wake_interval_ns,
               neutral_rate=0.02, initial_policy_rate=0.02, log_to_file=True):
    super().__init__(id=id, name=name, type="CentralBankAgent", random_state=random_state,
                     wake_interval_ns=wake_interval_ns, log_to_file=log_to_file)
    self.bank_id = bank_id
    self.government_id = government_id
    self.neutral_rate = float(neutral_rate)
    self.policy_rate = float(initial_policy_rate)
    self.last_unemployment_rate = 0.05
    self.last_inflation_proxy = 0.0

  def wakeup(self, currentTime):
    super().wakeup(currentTime)
    self.policy_rate = policy_rate_update(self.policy_rate, self.last_inflation_proxy,
                                          self.last_unemployment_rate, self.neutral_rate)
    rate_message = Message({"msg": "INTEREST_RATE_UPDATE", "sender": self.id, "policy_rate": self.policy_rate})
    self.sendMessage(self.bank_id, rate_message)
    self.sendMessage(self.government_id, Message({"msg": "INTEREST_RATE_UPDATE", "sender": self.id,
                                                  "policy_rate": self.policy_rate}))
    self.logEvent("POLICY_RATE_SET",
                  {"policy_rate": self.policy_rate, "inflation_proxy": self.last_inflation_proxy,
                   "unemployment_rate": self.last_unemployment_rate},
                  appendSummaryLog=True)
    self.schedule_next_wake()

  def receiveMessage(self, currentTime, msg):
    super().receiveMessage(currentTime, msg)
    if msg.body.get("msg") == "MACRO_SIGNAL":
      self.last_unemployment_rate = float(msg.body.get("unemployment_rate", self.last_unemployment_rate))
      self.last_inflation_proxy = float(msg.body.get("inflation_proxy", self.last_inflation_proxy))

