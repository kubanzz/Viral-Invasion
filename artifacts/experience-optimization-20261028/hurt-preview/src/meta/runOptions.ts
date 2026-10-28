import type { CampaignOptions } from '../game/battleTypes';
import { COUNTER_GUIDE_VERSION, type ProfileData, type RunEncounterRecord } from './profile';
import type { TraitId } from '../game/battleTypes';
import { availableStartingPlans, preparationForPlan } from '../game/preparation';

export type RunOptions = Pick<CampaignOptions, 'counterGuide' | 'encounterMode' | 'firstTrait' | 'preparation'>;

/** A new case uses acknowledged onboarding; retries retain their recorded variant. */
export function newRunOptions(profile: ProfileData, firstTrait?: TraitId): RunOptions {
  const guide = profile.onboarding;
  const acknowledged = guide.counterGuideVersion === COUNTER_GUIDE_VERSION && (guide.counterGuideCompleted || guide.counterGuideSkipped);
  const plan = availableStartingPlans(profile.unlockedProtocols).includes(profile.startingPlan) ? profile.startingPlan : 'field';
  return { counterGuide: acknowledged ? 'adaptive' : 'guided', encounterMode: 'formal', firstTrait, preparation: preparationForPlan(plan) };
}

export function replayRunOptions(record: RunEncounterRecord, explicitTrait?: TraitId): RunOptions {
  return { counterGuide: record.guideVariant, encounterMode: record.configId === 'campaign-1' ? 'formal' : 'fixture', firstTrait: explicitTrait ?? record.firstTraitOverride,
    preparation: record.preparation ?? preparationForPlan('field') };
}
