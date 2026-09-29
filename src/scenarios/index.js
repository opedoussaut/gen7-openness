// Scenario registry. One scenario is fully implemented; the others are prepared as cards
// and share the same engine contract (dataset → grooming → agents → MCP/A2A → telemetry → value).
import { manufacturingScenario } from './manufacturing/scenario.js';

export const SCENARIOS = [
  manufacturingScenario,
  {
    id: 'automotive', title: 'Automotive', domain: 'EV battery production', status: 'preview', icon: 'car',
    summary: 'Thermal anomaly during battery module end-of-line test.',
    agents: ['Cell Quality', 'Thermal Engineering', 'Supplier Quality', 'Sustainability'],
    servers: ['End-of-line test bench', 'Cell traceability', 'Thermal simulation', 'Battery passport']
  },
  {
    id: 'humanoid-robotics', title: 'Humanoid robotics', domain: 'Manipulation reliability', status: 'preview', icon: 'hand',
    summary: 'A humanoid drops parts during a bin-picking task on the line.',
    agents: ['Perception', 'Motion Planning', 'Simulation', 'Safety'],
    servers: ['Vision logs', 'Joint telemetry', 'Physics simulation', 'Task library']
  },
  {
    id: 'ai-factory', title: 'AI factory', domain: 'Data center energy & thermal', status: 'preview', icon: 'rack',
    summary: 'Can a cooling loop take a new 120 kW AI rack? Balance workload, thermal and energy.',
    agents: ['Rack Deployment', 'Liquid Cooling', 'Workload Scheduler', 'Sustainability'],
    servers: ['DCIM', 'Cooling loop telemetry', 'Power monitoring', 'Carbon intensity'],
    lab: './lab.html#demo'
  }
];
export const scenarioById = id => SCENARIOS.find(s => s.id === id);
