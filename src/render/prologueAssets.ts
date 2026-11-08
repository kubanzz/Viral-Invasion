import body from '../../asserts/ViralInvasion_Prologue_v1/production/body.jpg';
import lung from '../../asserts/ViralInvasion_Prologue_v1/production/lung.jpg';
import heart from '../../asserts/ViralInvasion_Prologue_v1/production/heart.jpg';
import vessel from '../../asserts/ViralInvasion_Prologue_v1/production/vessel.jpg';

/** AI-authored plates are embedded by the offline builder; no network fetch is needed. */
export const PROLOGUE_ART = { body, lung, heart, vessel } as const;
