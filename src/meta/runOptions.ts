import type { CampaignOptions } from '../game/battleTypes';
import { COUNTER_GUIDE_VERSION, type ProfileData, type RunEncounterRecord } from './profile';
import type { TraitId } from '../game/battleTypes';

export type RunOptions = Pick<CampaignOptions, 'counterGuide' | 'encounterMode' | 'firstTrait'>;

/** A new case uses acknowledged onboarding; retries retain their recorded variant. */
export function newRunOptions(profile: ProfileData, firstTrait?: TraitId): RunOptions {
  const guide = profile.onboarding;
  const acknowledged = guide.counterGuideVersion === COUNTER_GUIDE_VERSION && (guide.counterGuideCompleted || guide.counterGuideSkipped);
  return { counterGuide: acknowledged ? 'adaptive' : 'guided', encounterMode: 'formal', firstTrait };
}

export function replayRunOptions(record: RunEncounterRecord, explicitTrait?: TraitId): RunOptions {
  return { counterGuide: record.guideVariant, encounterMode: record.configId === 'campaign-1' ? 'formal' : 'fixture', firstTrait: explicitTrait ?? record.firstTraitOverride };
}
