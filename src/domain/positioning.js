// Dassault Systèmes Industrial AI vocabulary used by the GEN7 version of the demonstrator.
// Wording is taken from the internal material provided by the program (Industrial AI messaging,
// Virtual Companions glossary, Industry World Models). Do not add claims here that are not in those sources.

/** Virtual Companions of the 3DEXPERIENCE platform — "Competences and Skills" glossary. */
export const COMPANIONS = Object.freeze({
  AURA: { id: 'AURA', line: 'Empowers any user by leveraging Enterprise & Web Knowledge & Know-How', competences: ['3DSwymer', 'Project Manager', 'Compliance Officer', 'Business analyst', 'Risk Manager', 'Sourcing Manager'] },
  LEO: { id: 'LEO', line: 'Effectively solve technical challenges in all engineering disciplines', competences: ['Mechanical Engineer', 'Material Engineer', 'System Engineer', 'Requirement Engineer'] },
  MARIE: { id: 'MARIE', line: 'Bring Deep Scientific Knowledge to Engineers or Researchers', competences: ['Laboratory Analyst', 'Medicinal Chemist', 'Microbiologist', 'Material Scientist'] }
});

export const COMPETENCE_DEF = 'A Competence is the ability to perform a particular job or role. It covers an entire domain, relying on more granular Skills.';
export const SKILL_DEF = 'A Skill is the ability to perform a particular task.';

/** A tool name such as calculateCoolingHeadroom, read as the Skill it implements: "Calculate cooling headroom". */
export const skillName = tool => tool.replace(/([A-Z])/g, ' $1').trim().toLowerCase().replace(/^./, c => c.toUpperCase());

/** The five attributes of Dassault Systèmes' Industrial AI — core messaging. `demo` says where this demonstrator shows it. */
export const ATTRIBUTES = Object.freeze([
  { id: 'transformative', word: 'Transformative', against: 'everyone selling productivity', demo: 'AI cheap and verifiable enough to run on every capacity decision, not only on the few worth an expert’s day.', page: 'economics' },
  { id: 'scientific', word: 'Scientific', against: 'generic AI', demo: 'Every figure behind the decision comes from physics and site rules computed by deterministic tools; the model never does the arithmetic.', page: 'demo' },
  { id: 'actionable', word: 'Actionable', against: 'unfulfilled promises', demo: 'The run ends in a decision, four actions and one condition, approved by accountable people.', page: 'demo' },
  { id: 'open', word: 'Open', against: 'anyone claiming to have the one best AI', demo: 'Open at the agent layer, and the best model for each task: large reasoning models where judgement is needed, small specialist models elsewhere.', page: 'learn' },
  { id: 'trusted', word: 'Trusted', against: 'AI you cannot fully trust', demo: 'Every call, token and euro is recorded, every figure traceable to its source, the full trace exportable.', page: 'technical' }
]);

/** Industry World Models — three complementary pillars (source text, condensed without adding claims). */
export const IWM_PILLARS = Object.freeze([
  {
    id: 'knowledge', n: 1, title: 'Industry Knowledge & Know-how', tag: 'Industrial ground truth',
    source: 'Integrates the know-how of our clients with deep industrial expertise: engineering standards, product structures, manufacturing processes and operational best practices, enriched with virtual and real-world data — usage, production and quality metrics, maintenance records, field feedback.',
    items: ['Industry knowledge', 'Customer knowledge']
  },
  {
    id: 'understanding', n: 2, title: 'Industry World Understanding', tag: 'Science-grounded AI',
    source: 'AI operates on a unified representation of the virtual and real worlds, integrating structure with physical behaviour: modeling and simulation, high-fidelity physics solvers, AI models capturing system behaviours and structured ontologies. Outputs remain scientifically valid.',
    items: ['MODSIM conformity', 'Industrial AI models', 'V+R representations: structure synthesis + physics behaviours']
  },
  {
    id: 'reasoning', n: 3, title: 'Industry World Reasoning & Generation', tag: 'Experience-based reasoning',
    source: 'Activates industrial knowledge and world representations. Through multi-step planning, high-level objectives are broken down into coordinated tasks — exploration, simulation, validation, optimisation — handled by specialised agents working together.',
    items: ['Knowledge retrieval', 'Multi-tier planning', 'Logical exploration', 'Generation / Optimization']
  }
]);

export const IWM_QUALITIES = Object.freeze(['Multi-modal', 'Semantic-driven', 'Physics aware', 'Knowledge-guided', 'Science-grounded', 'Trustworthy']);
