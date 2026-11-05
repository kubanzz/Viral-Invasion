// src/game/types.ts
var BALANCE = { step: 1 / 60, speed: 235, dashSpeed: 780, dashDuration: 0.16, dashCooldown: 1.5, scanRadius: 650, scanCooldown: 3, range: 530, areaRadius: 96, cooldowns: { 1: 0.18, 2: 2, 3: 0.7 }, damage: { 1: 34, 2: 80 }, repair: 25, interactionRange: 110, trainingHitDamage: 5, trainingHitDuration: 0.55 };

// src/game/protocols.ts
var GROWTH_BALANCE = { slots: 3, xpThresholds: [20, 55, 95, 150, 220], researchCost: 3, maxRank: 3, chainCap: 3, commandBudget: 128, scanRadius: 650, beaconPlacementRange: 420 };

// src/game/immuneFocus.ts
var IMMUNE_FOCUS_BALANCE = { duration: 3, aimTolerance: 12, range: GROWTH_BALANCE.scanRadius };
var IMMUNE_GUARD_BALANCE = { minimumRank: 3, radius: 300, aimTolerance: 12, commandRange: GROWTH_BALANCE.scanRadius };

// src/game/dashBlade.ts
var DASH_BLADE_BALANCE = {
  damagePerRank: 55,
  baseRadius: 150,
  radiusPerRank: 10,
  maximumRadius: 240,
  baseHalfAngle: Math.PI * 0.6,
  circularRank: 3,
  returnRank: 6,
  returnDelay: 0.28,
  returnDamageFactor: 0.65,
  effectSeconds: 0.24
};

// src/game/endlessGrowth.ts
var PRIMARY_BASE_TICKS = Math.ceil(BALANCE.cooldowns[1] / BALANCE.step);
var PRIMARY_MIN_TICKS = 6;
var ENDLESS_UPGRADES = {
  power: { title: "\u51C0\u5316\u7A81\u7834", newMechanic: false },
  multishot: { title: "\u6247\u5F62\u6297\u4F53", maxRank: 2, newMechanic: true },
  pierce: { title: "\u8D2F\u7A7F\u51C0\u5316", maxRank: 3, newMechanic: true },
  nova: { title: "\u88C2\u89E3\u65B0\u661F", maxRank: 6, newMechanic: false },
  dash: { title: "\u51B2\u523A\u65A9", newMechanic: true },
  scan: { title: "\u626B\u63CF\u7206\u53D1", newMechanic: true },
  vitality: { title: "\u751F\u547D\u6269\u5BB9", newMechanic: false },
  haste: { title: "\u6025\u901F\u51C0\u5316", maxRank: PRIMARY_BASE_TICKS - PRIMARY_MIN_TICKS, newMechanic: false },
  immune: { title: "\u514D\u75AB\u519B\u56E2", newMechanic: false },
  catalysis: { title: "\u51C0\u5316\u4F59\u9707", maxRank: 1, newMechanic: true }
};
var MAX_COUNT = Number.MAX_SAFE_INTEGER;

// src/game/expedition.ts
var WEAPON_IDS = ["steady", "piercing"];
var RARITY_NAMES = { white: "\u666E\u901A", blue: "\u7CBE\u826F", purple: "\u53F2\u8BD7", gold: "\u4F20\u8BF4" };
var RARITY_BONUS = { white: 0, blue: 0.03, purple: 0.06, gold: 0.09 };
var WEAPONS = {
  steady: { name: "\u7A33\u6D41\u9488\u67AA", damage: 34, extraPierce: 0, description: "\u7A33\u5B9A\u70B9\u5C04\uFF0C\u5355\u4F53\u4F24\u5BB3\u66F4\u9AD8\u3002" },
  piercing: { name: "\u8D2F\u8109\u9488\u67AA", damage: 28, extraPierce: 1, description: "\u57FA\u7840\u5F39\u4E38\u6700\u591A\u547D\u4E2D\u4E24\u4F53\uFF0C\u9002\u5408\u8D2F\u7A7F\u5BC6\u96C6\u654C\u7FA4\u3002" }
};
var EXPEDITION_ECONOMY = { repair: 10, upgrade: [8, 12, 16], antibody: 5, maximumExtraAntibodies: 2, bossMaterials: 40 };
var DEFAULT_EXPEDITION_LOADOUT = Object.freeze({ weaponId: "steady", rarity: "white", upgrade: 0 });
function weaponCombatProfile(loadout, localMultiplier = 1) {
  const definition = WEAPONS[loadout.weaponId];
  const bonus = Math.min(0.18, RARITY_BONUS[loadout.rarity] + Math.max(0, Math.min(3, loadout.upgrade)) * 0.03);
  return {
    baseDamage: definition.damage,
    primaryDamage: definition.damage * (1 + bonus) * localMultiplier,
    permanentMultiplier: 1 + bonus,
    extraPierce: definition.extraPierce,
    weaponId: loadout.weaponId
  };
}

// src/ui/expeditionRewardHud.ts
function expeditionRewardMarkup(state) {
  const loot = state.expedition?.pendingLoot;
  if (!loot) return "";
  const weapon = WEAPONS[loot.weaponId];
  return `<section class="expedition-rewards" aria-label="\u672C\u6B21\u8FDC\u5F81\u6218\u5229\u54C1" data-rarity="${loot.rarity}">
    <header><span class="camp-quality camp-quality-${loot.rarity}">${RARITY_NAMES[loot.rarity]}\u6218\u5229\u54C1</span><strong>${state.expedition?.firstClear ? "\u566C\u5FC3\u6BCD\u5DE2\u9996\u80DC\u5956\u52B1" : "\u672C\u6B21\u5FC3\u810F\u8FDC\u5F81\u5956\u52B1"}</strong></header>
    <div class="expedition-reward-items"><article class="expedition-reward-weapon"><span class="camp-weapon-icon" data-camp-art="weapon-${loot.weaponId}-broken" aria-hidden="true"></span><div><h3>\u7834\u635F${weapon.name}</h3><p>${weapon.description}</p><small>\u56DE\u8425\u4FEE\u590D\u540E\u53EF\u88C5\u5907 \xB7 \u5F3A\u5316\u968F\u67AA\u578B\u4FDD\u7559</small></div></article>
    <article><span class="camp-facility-icon" data-camp-art="blueprint-rapid-launch-pod" aria-hidden="true"></span><div><h3>\u901F\u88C5\u5F39\u5C04\u835A\u84DD\u56FE</h3><p>16\u79D2\u88C5\u586B \xB7 \u77ED\u7A0B\u9AD8\u9891\u56DE\u9632</p><small>\u5DF2\u6709\u84DD\u56FE\u81EA\u52A8\u8F6C\u4E3A5\u751F\u8D28</small></div></article>
    <article><strong class="expedition-reward-material">+${loot.materials}</strong><div><h3>\u4FEE\u590D\u751F\u8D28</h3><p>\u4FEE\u590D\u3001\u953B\u9020\u4E0E\u51C6\u5907\u8865\u7ED9</p><small>\u91CD\u590D\u6216\u4F4E\u54C1\u8D28\u6B66\u5668\u53E6\u6309\u6536\u85CF\u89C4\u5219\u6298\u7B97</small></div></article></div>
  </section>`;
}

// src/ui/territoryHud.ts
var escape = (value) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
var time = (seconds) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
function territoryVictoryOverlay(state, profile) {
  const territory = state.territory, saved = territory?.rescueSnapshot;
  if (territory?.stage !== "victory" || state.phase !== "paused" || !saved) return null;
  return `<div class="overlay endless-overlay"><section class="modal endless-modal territory-victory" role="dialog" aria-modal="true" aria-label="\u5FC3\u6838\u6551\u63F4\u6210\u529F">
    <div class="endless-stage-seal" aria-hidden="true">\u271A</div><div class="eyebrow">ALL THINGS ALIVE / \u4E07\u7269\u751F</div>
    <h2>\u751F\u547D\u91CD\u65B0\u751F\u957F\uFF0C\u6551\u63F4\u6210\u529F\u3002</h2><p>\u53CC\u7EBF\u519B\u56E2\u5B8C\u6210\u63A5\u9632\uFF0C\u4E24\u5904\u611F\u67D3\u6E90\u4E0E\u6BCD\u5DE2\u5DF2\u51C0\u5316\u3002</p>
    <div class="stats"><div><strong>${time(saved.elapsed)}</strong><small>\u6551\u63F4\u7528\u65F6</small></div><div><strong>${saved.score}</strong><small>\u6551\u63F4\u5F97\u5206</small></div><div><strong>${Math.ceil(saved.coreHp)}%</strong><small>\u83B7\u6551\u65F6\u5FC3\u6838\u5B8C\u6574\u5EA6</small></div></div>
    ${expeditionRewardMarkup(state)}
    <p class="territory-victory-receipt">\u6218\u5229\u54C1\u5DF2\u5E26\u56DE\u3002\u7EE7\u7EED\u5B88\u536B\u6CBF\u7528\u672C\u5C40\u6210\u957F\uFF0C\u4E4B\u540E\u5931\u5B88\u4E5F\u4FDD\u7559\u8FD9\u6B21\u6210\u529F\u3002</p>
    <p>\u5168\u57DF\u51C0\u5316\u7D2F\u8BA1 ${time(saved.fullyPurifiedSeconds ?? 0)} \xB7 \u6700\u957F\u8FDE\u7EED ${time(saved.longestFullyPurifiedSeconds ?? 0)}</p>
    ${profile ? `<p class="endless-storage ${profile.status.mode === "session" ? "is-temporary" : ""}" role="status">${escape(profile.status.message)}</p>` : ""}
    <div class="actions">${state.expedition?.pendingLoot ? '<button class="primary" data-action="camp-open-forge">\u56DE\u8425\u4FEE\u590D\u6218\u5229\u54C1</button>' : ""}<button${state.expedition?.pendingLoot ? "" : ' class="primary"'} data-action="camp-open">\u8FDB\u5165\u5FC3\u810F\u8425\u5730</button><button data-action="territory-guard">\u7EE7\u7EED\u5B88\u536B</button><button data-action="growth-details">\u67E5\u770B\u914D\u88C5</button></div>
    ${profile?.status.mode === "session" ? '<button class="territory-save-retry" data-action="territory-save">\u91CD\u8BD5\u4FDD\u5B58\u6210\u679C</button>' : ""}
  </section></div>`;
}

// src/ui/campHud.ts
var CAMP_SECTIONS = ["overview", "warehouse", "forge", "shop", "departure"];
var LABELS = { overview: "\u514D\u75AB\u8425\u5730", warehouse: "\u6B66\u5668\u4ED3\u5E93", forge: "\u953B\u9020\u53F0", shop: "\u8865\u7ED9\u7AD9", departure: "\u51FA\u51FB\u53F0", trial: "\u5B89\u5168\u8BD5\u67AA\u573A" };
var escape2 = (v) => v.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
var quality = (v) => v ? `<span class="camp-quality camp-quality-${v}">${RARITY_NAMES[v]}</span>` : '<span class="camp-muted">\u672A\u6536\u85CF</span>';
function campFirstSteps(snapshot, trialCompleted = false) {
  const { data } = snapshot;
  if (data.victories !== 1 || trialCompleted) return null;
  const pending = WEAPON_IDS.find((id) => data.weapons[id].pending);
  if (pending) return { step: "repair", weaponId: pending, title: "\u5148\u4FEE\u590D\u672C\u6B21\u6218\u5229\u54C1", description: `\u82B110\u751F\u8D28\u4FEE\u590D${WEAPONS[pending].name}\uFF0C\u518D\u88C5\u5907\u5E76\u8BD5\u5C04\u3002` };
  if (data.weapons.piercing.repaired && data.equipped !== "piercing") return { step: "equip", weaponId: "piercing", title: "\u628A\u65B0\u67AA\u5E26\u5230\u8BD5\u67AA\u573A", description: "\u8D2F\u8109\u9488\u67AA\u5355\u4F53\u4F24\u5BB3\u8F83\u4F4E\uFF0C\u4F46\u4E00\u53D1\u80FD\u8D2F\u7A7F\u4E24\u53EA\u654C\u4EBA\u3002\u8BD5\u5C04\u540E\u518D\u51B3\u5B9A\u914D\u88C5\u3002" };
  return { step: "trial", weaponId: data.equipped, title: "\u8BD5\u5C04\u4E00\u6B21\uFF0C\u770B\u770B\u65B0\u6253\u6CD5", description: "\u4E24\u53EA\u7EC3\u4E60\u9776\u6392\u5217\u5728\u540C\u4E00\u76F4\u7EBF\uFF1B\u5BF9\u6BD4\u5355\u4F53\u70B9\u6740\u4E0E\u53CC\u4F53\u8D2F\u7A7F\u3002" };
}
function firstStepsMarkup(snapshot, presentation) {
  const next = campFirstSteps(snapshot, presentation.trialCompleted);
  if (!next) return "";
  const action = next.step === "repair" ? 'data-action="camp-section" data-section="forge"' : `data-action="${next.step === "equip" ? "camp-equip-trial" : "camp-trial"}" data-weapon="${next.weaponId}"`;
  return `<aside class="camp-first-steps" aria-label="\u9996\u6B21\u56DE\u8425\u5EFA\u8BAE"><div><strong>${next.title}</strong><p>${next.description}</p><ol><li data-complete="${next.step !== "repair"}">\u4FEE\u590D</li><li data-complete="${next.step === "trial"}">\u88C5\u5907</li><li>\u8BD5\u5C04</li><li>\u51FA\u51FB</li></ol></div><button ${action}>${next.step === "repair" ? "\u524D\u5F80\u4FEE\u590D" : next.step === "equip" ? "\u88C5\u5907\u5E76\u8BD5\u5C04" : "\u53BB\u8BD5\u5C04"}</button></aside>`;
}
function weaponCard(snapshot, id, forge) {
  const data = snapshot.data, item = data.weapons[id], definition = WEAPONS[id], equipped = data.equipped === id;
  const stats = item.repaired ? weaponCombatProfile({ weaponId: id, rarity: item.repaired, upgrade: item.upgrade }) : null;
  return `<article class="camp-weapon-card${equipped ? " is-equipped" : ""}" data-camp-weapon="${id}">
    <div class="camp-weapon-icon" data-camp-art="weapon-${id}" aria-hidden="true"></div>
    <div><h3>${definition.name} <small>+${item.upgrade}</small></h3><p>${quality(item.repaired)}${equipped ? '<span class="camp-equipped">\u5DF2\u88C5\u5907</span>' : ""}</p>
    <p><b class="camp-weapon-role">${id === "steady" ? "\u5355\u4F53\u70B9\u6740" : "\u53CC\u4F53\u8D2F\u7A7F"}</b> \xB7 ${definition.description}</p><p class="camp-stat">${stats ? `\u57FA\u7840\u5F39\u4F24\u5BB3 ${stats.primaryDamage.toFixed(1)} \xB7 ${1 + stats.extraPierce}\u4E2A\u57FA\u7840\u76EE\u6807` : "\u4FEE\u590D\u540E\u53EF\u88C5\u5907"}${stats ? ` \xB7 \u6C38\u4E45\u589E\u5E45 ${Math.round((stats.permanentMultiplier - 1) * 100)}%` : ""}</p>
    ${item.pending ? `<p class="camp-pending">\u5F85\u4FEE\u590D\uFF1A${quality(item.pending)} ${definition.name}</p>` : ""}</div>
    <div class="camp-card-actions">${forge ? `${item.pending ? `<button data-action="camp-repair" data-weapon="${id}" ${data.materials < 10 ? "disabled" : ""}>\u4FEE\u590D \xB7 10\u751F\u8D28</button>` : ""}
      ${item.repaired ? `<button data-action="camp-upgrade" data-weapon="${id}" ${item.upgrade >= 3 || data.materials < (EXPEDITION_ECONOMY.upgrade[item.upgrade] ?? 0) ? "disabled" : ""}>${item.upgrade >= 3 ? "\u5DF2\u8FBE +3 \u4E0A\u9650" : `\u5F3A\u5316\u81F3 +${item.upgrade + 1} \xB7 ${EXPEDITION_ECONOMY.upgrade[item.upgrade]}\u751F\u8D28`}</button><button data-action="${equipped ? "camp-trial" : "camp-equip-trial"}" data-weapon="${id}">${equipped ? "\u8BD5\u5C04\u6B64\u67AA" : "\u88C5\u5907\u5E76\u8BD5\u5C04"}</button>` : ""}` : `<button data-action="camp-equip" data-weapon="${id}" ${!item.repaired || equipped ? "disabled" : ""}>${equipped ? "\u5F53\u524D\u88C5\u5907" : item.repaired ? "\u88C5\u5907\u5230\u4E0B\u6B21\u51FA\u51FB" : "\u8BF7\u5148\u4FEE\u590D"}</button>${item.repaired ? `<button data-action="camp-trial" data-weapon="${id}">\u8BD5\u5C04\u6B64\u67AA</button>` : ""}`}</div>
  </article>`;
}
function campOverlay(snapshot, section = "overview", introProgress = 1, notice = "", presentation = {}) {
  const { data, status } = snapshot;
  const intro = !data.campIntroSeen && introProgress < 1;
  const nav = CAMP_SECTIONS.map((id) => `<button data-action="camp-section" data-section="${id}" ${section === id ? 'aria-current="page"' : ""}>${LABELS[id]}</button>`).join("");
  let content;
  if (section === "trial") {
    const selected = presentation.trialWeaponId ?? data.equipped;
    content = `<p class="camp-section-copy">\u70B9\u6309\u5C04\u51FB\uFF0C\u89C2\u5BDF\u4E00\u53D1\u80FD\u547D\u4E2D\u51E0\u53EA\u9776\u3002\u4F7F\u7528\u5F53\u524D\u6C38\u4E45\u54C1\u8D28\u4E0E\u5F3A\u5316\uFF0C\u4E0D\u5E26\u5C40\u5185\u5F3A\u5316\uFF1B\u8BD5\u67AA\u4E0D\u6D88\u8017\u7269\u8D44\u3001\u4E0D\u8BA1\u5206\u3002</p><div class="camp-trial-stage"><div class="camp-trial-options" aria-label="\u8BD5\u5C04\u6B66\u5668">${WEAPON_IDS.filter((id) => data.weapons[id].repaired).map((id) => `<button data-action="camp-trial" data-weapon="${id}" ${selected === id ? 'aria-pressed="true"' : ""}><strong>${WEAPONS[id].name}</strong><small>${id === "steady" ? "\u5355\u4F53\u70B9\u6740" : "\u53CC\u4F53\u8D2F\u7A7F"}</small></button>`).join("")}</div><canvas id="camp-trial-canvas" class="camp-trial-canvas" width="560" height="220" aria-label="\u4E24\u53EA\u540C\u7EBF\u7EC3\u4E60\u9776\uFF0C\u70B9\u6309\u5C04\u51FB\u53EF\u6BD4\u8F83\u5355\u4F53\u548C\u8D2F\u7A7F"></canvas></div>`;
  } else if (section === "warehouse" || section === "forge") content = `<p class="camp-section-copy">${section === "forge" ? "\u7834\u635F\u6B66\u5668\u5148\u4FEE\u590D\uFF0C\u518D\u9009\u62E9\u6700\u591A\u4E09\u7EA7\u5F3A\u5316\u3002\u4FEE\u590D\u540E\u53EF\u76F4\u63A5\u88C5\u5907\u5E76\u8BD5\u5C04\uFF1B\u6362\u66F4\u9AD8\u54C1\u8D28\u65F6\u4FDD\u7559\u5DF2\u6709\u5F3A\u5316\u3002" : "\u9009\u62E9\u4E0B\u4E00\u6B21\u51FA\u51FB\u7684\u4E3B\u6B66\u5668\u3002\u5355\u4F53\u70B9\u6740\u4E0E\u8D2F\u7A7F\u6E05\u7EBF\u5404\u6709\u7528\u9014\uFF0C\u53EF\u5148\u8BD5\u5C04\u518D\u51B3\u5B9A\u3002"}</p><div class="camp-weapons">${WEAPON_IDS.map((id) => weaponCard(snapshot, id, section === "forge")).join("")}</div>`;
  else if (section === "shop") content = `<div class="camp-supply-card"><div class="camp-facility-icon" data-camp-art="supply" aria-hidden="true"></div><h3>\u6297\u4F53\u589E\u914D</h3><p>\u9ED8\u8BA4\u643A\u5E262\u652F\uFF0C\u53EF\u4E3A\u4E0B\u6B21\u51FA\u51FB\u989D\u5916\u51C6\u5907\u6700\u591A2\u652F\u3002</p><p class="camp-stock">\u5DF2\u5907\u8D27 ${data.extraAntibodyStock} / 2 \xB7 \u51FA\u51FB\u603B\u8BA1 ${2 + data.extraAntibodyStock} \u652F</p><button data-action="camp-buy-antibody" ${data.extraAntibodyStock >= 2 || data.materials < 5 ? "disabled" : ""}>${data.extraAntibodyStock >= 2 ? "\u5907\u8D27\u5DF2\u6EE1" : "\u8D2D\u4E701\u652F \xB7 5\u751F\u8D28"}</button><p class="camp-muted">\u51FA\u53D1\u65F6\u6D88\u8017\u5907\u8D27\uFF0C\u6B7B\u4EA1\u6216\u9000\u51FA\u4E0D\u8FD4\u8FD8\u3002</p></div>`;
  else if (section === "departure") {
    const id = data.equipped, item = data.weapons[id];
    content = `<div class="camp-departure"><h3>\u5FC3\u810F \xB7 \u518D\u6B21\u6E05\u527F</h3><p>\u519B\u56E2\u3001\u6218\u573A\u5EFA\u7B51\u548C\u5C40\u5185\u8FDB\u5316\u91CD\u65B0\u5F00\u59CB\uFF1B\u5DF2\u89E3\u9501\u84DD\u56FE\u4E0E\u6C38\u4E45\u88C5\u5907\u4FDD\u7559\u3002</p><dl><div><dt>\u4E3B\u6B66\u5668</dt><dd>${WEAPONS[id].name} ${quality(item.repaired)} +${item.upgrade}</dd></div><div><dt>\u5EFA\u7B51\u84DD\u56FE</dt><dd>${data.blueprints.includes("launch-pod") ? "\u57FA\u7840\u5F39\u5C04\u835A" : "\u5B88\u7EBF\u89E3\u9501"}${data.blueprints.includes("rapid-launch-pod") ? " \xB7 \u901F\u88C5\u5F39\u5C04\u835A" : ""}</dd></div><div><dt>\u5DE5\u7A0B\u8865\u7ED9</dt><dd>2\u4EFD \xB7 \u51FB\u7834\u611F\u67D3\u6E90\u53EF\u8865\u5145</dd></div><div><dt>\u6297\u4F53</dt><dd>${2 + data.extraAntibodyStock}\u652F</dd></div></dl><p class="camp-muted">\u65B0\u5668\u5B98\u5C06\u5728\u540E\u7EED\u8FDC\u5F81\u5F00\u653E\u3002</p></div>`;
  } else content = `<p class="camp-section-copy">\u5FC3\u810F\u5DF2\u6210\u4E3A\u5B89\u5168\u636E\u70B9\u3002\u4FEE\u590D\u6218\u5229\u54C1\u3001\u51C6\u5907\u8865\u7ED9\uFF0C\u518D\u5E26\u7740\u65B0\u7684\u6253\u6CD5\u51FA\u53D1\u3002</p><div class="camp-facilities">${["warehouse", "forge", "shop", "departure"].map((id) => `<button class="camp-facility" data-action="camp-section" data-section="${id}"><span class="camp-facility-icon" data-camp-art="${id}" aria-hidden="true"></span><strong>${LABELS[id]}</strong><small>${{ warehouse: "\u6536\u85CF\u4E0E\u914D\u88C5", forge: "\u4FEE\u590D\u4E0E\u5F3A\u5316", shop: "\u6297\u4F53\u5907\u8D27", departure: "\u518D\u6B21\u6311\u6218\u5FC3\u810F" }[id]}</small></button>`).join("")}</div><p class="camp-summary">\u5DF2\u5B8C\u6210 ${data.victories} \u6B21\u65B0\u8FDC\u5F81 \xB7 \u84DD\u56FE ${data.blueprints.length} / 2</p>`;
  return `<div class="overlay camp-overlay"><section class="camp-panel${section === "trial" ? " camp-trial-panel" : ""}" aria-labelledby="camp-title"><header class="camp-header"><div><p>${section === "trial" ? "\u5B89\u5168\u7EC3\u4E60 \xB7 \u4E0D\u6D88\u8017\u7269\u8D44" : "HEART SANCTUARY"}</p><h2 id="camp-title">${LABELS[section]}</h2></div><span class="camp-material" aria-label="\u4FEE\u590D\u751F\u8D28">\u751F\u8D28 <b>${data.materials}</b></span>${intro && section !== "overview" ? '<button class="camp-header-skip" data-action="camp-skip-intro">\u5B8C\u6210\u642D\u5EFA</button>' : ""}<button class="camp-close" data-action="camp-close" aria-label="\u5173\u95ED\u8425\u5730\u9762\u677F">\xD7</button></header>
    ${intro && section === "overview" ? `<div class="camp-intro" role="status"><span>\u514D\u75AB\u5C0F\u961F\u6B63\u5728\u642D\u5EFA\u5B89\u5168\u8425\u5730</span><div><i style="width:${Math.max(0, Math.min(100, introProgress * 100))}%"></i></div><button data-action="camp-skip-intro">\u5B8C\u6210\u642D\u5EFA</button></div>` : ""}
    <nav class="camp-nav" aria-label="\u8425\u5730\u8BBE\u65BD">${nav}</nav><div class="camp-content">${["overview", "warehouse", "forge"].includes(section) ? firstStepsMarkup(snapshot, presentation) : ""}${content}</div>
    <footer class="camp-footer">${notice && status.mode !== "session" && status.code !== "corrupt" ? `<p role="status">${escape2(notice)}</p>` : ""}${status.mode === "session" || status.code === "corrupt" ? `<p class="camp-storage" role="status">${escape2(status.message)} <button data-action="camp-retry-save">\u91CD\u8BD5\u4FDD\u5B58</button></p>` : '<p class="camp-muted">\u6C38\u4E45\u88C5\u5907\u5DF2\u4FDD\u5B58 \xB7 \u672A\u5B8C\u6210\u8FDC\u5F81\u7684\u6218\u5229\u54C1\u9700\u51C0\u5316\u540E\u5E26\u56DE</p>'}<div class="camp-footer-actions">${section === "trial" ? '<div class="camp-trial-actions"><button class="primary" data-action="camp-trial-fire">\u70B9\u6309\u5C04\u51FB</button><button data-action="camp-trial-reset">\u91CD\u7F6E\u7EC3\u4E60\u9776</button><button data-action="camp-section" data-section="warehouse">\u8FD4\u56DE\u914D\u88C5</button></div>' : ""}${section === "departure" ? '<button class="primary" data-action="camp-deploy">\u51FA\u51FB\u5FC3\u810F \u2197</button>' : section === "trial" ? '<button class="primary" data-action="camp-section" data-section="departure">\u51C6\u5907\u51FA\u51FB \u2197</button>' : ""}<button data-action="camp-leave">\u8FD4\u56DE\u4E3B\u83DC\u5355</button></div></footer>
  </section></div>`;
}
export {
  campOverlay,
  territoryVictoryOverlay
};
