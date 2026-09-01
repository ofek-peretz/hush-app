/**
 * The motion registry — the single place that maps an exercise id to its rig, mirroring the shape
 * of `platform/media/exerciseVideo`. Empty entries fall back to the existing video seam and then
 * the static silhouette, so an exercise lights up the moment its rig is added, with no other change.
 */

// 

import type { Rig } from './types';
import { bbBenchPress } from './library/bbBenchPress';
import { bbBackSquat } from './library/bbBackSquat';
import { bbRow } from './library/bbRow';
import { closeGripPulldown, latPulldown } from './library/latPulldown';
import { closeGripBench, dbBenchPress, declineBbPress, inclineBbPress, inclineDbPress, inclineMachinePress, machineChestPress, smithBenchPress, smithInclinePress } from './library/pressHorizontal';
import { arnoldPress, dbShoulderPress, machineShoulderPress, smithOverheadPress } from './library/pressVertical';
import { bbOverheadPress } from './library/overheadPressStanding';
import { cableRow, dbRow, facePull, inclineDbRow, machineRow, meadowsRow, singleArmCableRow, smithRow, tBarRow } from './library/pullRow';
import { bbDeadlift, bbRdl, cablePullThrough, dbRdl, goodMorning, sumoDeadlift, trapBarDeadlift } from './library/hinge';
import { bbCurl, bbCurl21, cableCurl, cableRopeHammerCurl, concentrationCurl, dbCurl, ezBarCurl, hammerCurl, inclineDbCurl, preacherCurl, reverseCurl, singleArmCableCurl, spiderCurl } from './library/curl';
import { cableLateralRaise, cableUprightRow, dbLateralRaise, machineLateralRaise } from './library/lateralRaise';
import { machineTricepsExt, ropePushdown, singleArmPushdown, tricepsKickback, tricepsPushdown } from './library/pushdown';
import { cableKickback, donkeyKick, machineKickback } from './library/gluteKickback';
import { dbCalfRaise, singleLegCalfRaise, smithCalfRaise, standingCalfRaise } from './library/calfStraight';
import { legExtension, seatedLegCurl } from './library/kneeMachine';
import { hackSquatRig, legPressCalfRaiseRig, legPressRig, singleLegPressRig } from './library/legPress';
import { assistedPullUpRig, chinUpRig, pullUpRig } from './library/pullUp';
import { frogPumpRig, gluteBridgeRig, hipThrustRig, machineHipThrustRig, singleLegHipThrustRig, smithHipThrustRig } from './library/thrust';
import { bulgarianSplitSquatRig, curtsyLungeRig, reverseLungeRig, walkingLungeRig } from './library/lunge';
import { cableFlyRig, dbFlyRig, inclineDbFlyRig, lowCableFlyRig, pecDeckRig, rearDeltFlyRig, reversePecDeckRig } from './library/fly';
import { bbShrugRig, dbShrugRig } from './library/shrug';
import { cableCrunchRig, machineCrunchRig, sitUpRig } from './library/crunch';
import { dbSumoSquatRig, frontSquatRig, gobletSquatRig, smithSquatRig } from './library/squatVariants';
import { cableFrontRaise, dbFrontRaise } from './library/frontRaise';
import { seatedCalfRaiseRig, seatedDbCalfRaiseRig } from './library/calfBent';
import { dbOverheadTricepsExt, overheadTricepsExt, skullcrusher } from './library/overheadTriceps';
import { cableHipAbduction, cableHipAdduction, hipAbductionRig, hipAdductionRig } from './library/hipAbduction';
import { backExtensionRig } from './library/backExtension';
import { legCurlLying, standingLegCurl } from './library/legCurlLying';
import { dbPullover, landminePress, straightArmPulldown } from './library/armSweeps';
import { captainsChairRaise, hangingLegRaise, lyingLegRaise } from './library/legRaise';
import { cableWoodchop, russianTwist } from './library/rotationCore';
import { abWheel, deadBug } from './library/antiExtension';
import { bicycleCrunch, nordicCurl, pikePushUp, singleLegRdl, stepUpRig } from './library/hardTail';
import { declinePushUpRig, diamondPushUpRig, invertedRowRig, pushUpRig } from './library/pushUp';
import { assistedDipRig, benchDipRig, chestDipRig, machineDipRig } from './library/dips';

const RIGS: Rig[] = [
  // benchmarks
  bbBenchPress, bbBackSquat, bbRow, latPulldown,
  // press_horizontal
  inclineBbPress, dbBenchPress, inclineDbPress, machineChestPress, closeGripBench, smithBenchPress, inclineMachinePress,
  // press_vertical
  bbOverheadPress, dbShoulderPress, machineShoulderPress, arnoldPress, smithOverheadPress,
  // pull_row
  tBarRow, dbRow, cableRow, machineRow, facePull, singleArmCableRow, smithRow, inclineDbRow,
  // hinge
  bbDeadlift, bbRdl, dbRdl, goodMorning, sumoDeadlift, trapBarDeadlift, cablePullThrough,
  // curl
  bbCurl, dbCurl, cableCurl, singleArmCableCurl, hammerCurl, reverseCurl, preacherCurl, concentrationCurl, inclineDbCurl,
  // the bodybuilding shelf (choice-only, 2026-08-26)
  ezBarCurl, bbCurl21, cableRopeHammerCurl, spiderCurl, ropePushdown,
  // lateral_raise
  dbLateralRaise, cableLateralRaise, machineLateralRaise,
  // elbow_extension_pushdown
  tricepsPushdown, singleArmPushdown, machineTricepsExt, tricepsKickback,
  // kickback (glute)
  cableKickback, machineKickback,
  // calf_straight
  standingCalfRaise, smithCalfRaise, dbCalfRaise, singleLegCalfRaise, legPressCalfRaiseRig,
  // knee_extension + knee_flexion (seated)
  legExtension, seatedLegCurl,
  // squat_supported
  legPressRig, singleLegPressRig, hackSquatRig,
  // pulldown (the bodyweight members)
  pullUpRig, chinUpRig, assistedPullUpRig,
  // thrust + bridge
  hipThrustRig, machineHipThrustRig, singleLegHipThrustRig, gluteBridgeRig,
  // lunge
  bulgarianSplitSquatRig, walkingLungeRig, reverseLungeRig,
  // fly + rear_delt
  pecDeckRig, cableFlyRig, inclineDbFlyRig, rearDeltFlyRig, reversePecDeckRig,
  // shrug
  bbShrugRig, dbShrugRig,
  // crunch
  sitUpRig, cableCrunchRig, machineCrunchRig,
  // squat (completed)
  frontSquatRig, gobletSquatRig, smithSquatRig,
  // front_raise
  dbFrontRaise, cableFrontRaise,
  // calf_bent
  seatedCalfRaiseRig, seatedDbCalfRaiseRig,
  // elbow_extension_overhead
  overheadTricepsExt, dbOverheadTricepsExt, skullcrusher,
  // abduction + adduction
  hipAbductionRig, hipAdductionRig, cableHipAbduction, cableHipAdduction,
  // hinge_isolated
  backExtensionRig,
  // knee_flexion (completed, save the nordic)
  legCurlLying, standingLegCurl,
  // the long-arm sweeps
  straightArmPulldown, landminePress,
  // leg_raise
  hangingLegRaise, captainsChairRaise, lyingLegRaise,
  // rotation
  russianTwist, cableWoodchop,
  // anti_extension
  abWheel, deadBug,
  // the hard tail
  nordicCurl, singleLegRdl, pikePushUp, stepUpRig, bicycleCrunch,
  // the plank core: push-ups + the inverted row
  pushUpRig, diamondPushUpRig, declinePushUpRig, invertedRowRig,
  // the support core: dips
  chestDipRig, assistedDipRig, benchDipRig, machineDipRig,
  // the bodybuilding floor, batch 2 (choice-only, 2026-08-26)
  declineBbPress, dbFlyRig, smithInclinePress, lowCableFlyRig,
  dbPullover, closeGripPulldown, meadowsRow, cableUprightRow,
  curtsyLungeRig, dbSumoSquatRig, smithHipThrustRig, frogPumpRig, donkeyKick,
];

export const EXERCISE_MOTION: Record<string, Rig> = Object.fromEntries(RIGS.map((r) => [r.id, r]));

export function exerciseMotion(exerciseId: string | null | undefined): Rig | null {
  if (!exerciseId) return null;
  return EXERCISE_MOTION[exerciseId] ?? null;
}

export function hasExerciseMotion(exerciseId: string | null | undefined): boolean {
  return exerciseMotion(exerciseId) != null;
}
