export * from './types';
export { matchRecords } from './match';
export { diffPair, diffRecords } from './diff';
export {
  amendPairDecision,
  decisionField,
  decisionKey,
  diffSignature,
  fingerprintRecords,
  resolve,
} from './resolve';
export { mergeAircraft, mergedImport, toMergedLogbook } from './merge';
export type { MergeSources } from './merge';
export { proposeRules, ruleDecisions } from './rules';
export type { RuleProposal } from './rules';
