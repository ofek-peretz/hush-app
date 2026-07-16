/**
 * Hush Engine v5 — the pure core (Stage 1). Loop 1 (in-session), Loop 2 (between sessions), the
 * equipment grid, and reps-per-rung. No UI, no persistence, no wall-clock trigger, no RNG.
 * See docs/canonical/ENGINE_V5_SITUATION_REGISTER.md.
 */
export * from './types';
export * from './constants';
export { snapDown, nextRung, prevRung, moveRungs, loadFloor } from './grid';
export { median, percentileNearestRank, theilSenSlope } from './stats';
export { repsPerRung, rungsForHeadroom } from './repsPerRung';
export { correctInSession, type Loop1Input, type Loop1Result } from './loop1';
export { decideExercise, type Loop2Input } from './loop2';
export { decideVolume, type VolumeInput, type VolumeResult, type VolumeDecision } from './loop3';
export { learnedRestS, setsToMinutes, maxSetsInBudget, fitsBudget } from './timeBudget';
export { chooseDonor, type VolumeCandidate } from './volumeAllocation';
export { bandFor, DEFAULT_REP_BAND } from './repBand';
export { stanceOf, trainableMuscles, emphasisMuscles, validateMap, shouldAskBackOnOff, type BodyMap } from './bodyMap';
export { regionOf, weeklyTargets, regionVolume, assignRegionDays, hasEmphasis } from './assembler';
