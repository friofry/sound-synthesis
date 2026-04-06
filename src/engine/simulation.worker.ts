/// <reference lib="webworker" />

import { runSimulation } from "./simulation";
import type { SimulationWorkerMessage, SimulationWorkerRequest } from "./types";

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  try {
    const { graph, params } = event.data;
    const result = runSimulation(graph, params, (completed, total) => {
      const progress: SimulationWorkerMessage = { type: "progress", completed, total };
      self.postMessage(progress);
    });

    const message: SimulationWorkerMessage = { type: "complete", result };
    self.postMessage(message);
  } catch (error) {
    const message: SimulationWorkerMessage = {
      type: "error",
      message: error instanceof Error ? error.message : "Simulation failed",
    };
    self.postMessage(message);
  }
};

export {};
