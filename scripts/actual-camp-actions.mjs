const attribute = (selector, name) => new RegExp(`${name}=["']?([^"'\\]\\s]+)`).exec(selector)?.[1];

async function observation(page) {
  return page.evaluate(() => {
    const state = window.__viral.snapshot();
    return { profile: JSON.parse(localStorage.getItem('viral-invasion:1:camp-profile')),
      camp: state.camp, phase: state.phase, runId: state.expedition?.runId,
      section: document.querySelector('.camp-nav [aria-current="page"]')?.getAttribute('data-section'),
      trial: window.__viral.diagnostics().campTrial,
      trialVisible: !!document.querySelector('#camp-trial-canvas')?.getBoundingClientRect().height };
  });
}

function completed(selector, before, after) {
  const action = attribute(selector, 'data-action'), weapon = attribute(selector, 'data-weapon');
  const oldWeapon = before.profile?.weapons[weapon], newWeapon = after.profile?.weapons[weapon];
  if (action === 'camp-repair') return !!oldWeapon?.pending && !newWeapon?.pending && !!newWeapon?.repaired;
  if (action === 'camp-upgrade') return newWeapon?.upgrade > oldWeapon?.upgrade;
  if (action === 'camp-buy-antibody') return after.profile?.extraAntibodyStock > before.profile?.extraAntibodyStock;
  if (action === 'camp-equip') return after.profile?.equipped === weapon && before.profile?.equipped !== weapon;
  if (action === 'camp-skip-intro') return !before.camp?.introComplete && after.camp?.introComplete;
  if (action === 'camp-open-forge') return !!after.camp && after.section === 'forge';
  if (action === 'camp-section') return after.section === attribute(selector, 'data-section');
  if (action === 'camp-trial' || action === 'camp-equip-trial') return after.trialVisible && after.trial?.loadout.weaponId === weapon
    && (action !== 'camp-equip-trial' || after.profile?.equipped === weapon);
  if (action === 'camp-trial-fire') return after.trial?.shots > (before.trial?.shots ?? 0);
  if (action === 'camp-trial-reset') return before.trial?.shots > 0 && after.trial?.shots === 0 && after.trial?.hits === 0;
  if (action === 'camp-deploy') return !after.camp && after.phase === 'playing' && after.runId !== before.runId;
  return false;
}

/** Retries only real UI activation; never writes storage or gameplay state. */
export function createCampActivator(page, rawActivate, report) {
  return async selector => {
    const before = await observation(page);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { await rawActivate(selector); await page.waitForTimeout(100); return; }
      catch (error) {
        await page.waitForTimeout(100);
        const after = await observation(page);
        const wasCompleted = completed(selector, before, after);
        (report.campActionRetries ??= []).push({ selector, attempt, error: String(error), completedAfterError: wasCompleted });
        if (wasCompleted) return;
        if (attempt === 3) throw error;
      }
    }
  };
}
