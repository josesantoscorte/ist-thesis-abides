import pandas as pd

from agent.Agent import Agent
from util.util import log_print


class EconomicAgent(Agent):
  def __init__(self, id, name, type, random_state, wake_interval_ns, log_to_file=True):
    super().__init__(id=id, name=name, type=type, random_state=random_state, log_to_file=log_to_file)
    self.wake_interval_ns = int(wake_interval_ns)

  def kernelStarting(self, startTime):
    super().kernelStarting(startTime)

  def schedule_next_wake(self):
    next_time = self.currentTime + pd.Timedelta(self.wake_interval_ns, unit='ns')
    self.setWakeup(next_time)

  def receiveMessage(self, currentTime, msg):
    super().receiveMessage(currentTime, msg)
    if msg is None or msg.body is None:
      log_print("Agent {} received empty message.", self.name)

