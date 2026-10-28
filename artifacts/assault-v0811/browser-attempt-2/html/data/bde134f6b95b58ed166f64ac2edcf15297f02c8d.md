# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assault-v0811.spec.ts >> naturally unlocks tissue guard and leaves real cells to intercept an assault while approaching a source
- Location: tests\e2e\assault-v0811.spec.ts:12:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic "病毒入侵战场：WASD移动，鼠标瞄准，1精准净化，2范围控场，3抢修，Q召集免疫细胞，E交互" [ref=e2]
  - generic:
    - banner:
      - generic:
        - generic: +
        - generic:
          - strong: Viral Invasion
          - generic: 病毒入侵 · 微观幻想
      - navigation:
        - generic: ●连续挑战 / 3
        - button "声音开关" [ref=e3] [cursor=pointer]: 声音 开
        - button "操作指南" [ref=e4] [cursor=pointer]
        - button "暂停 Esc" [ref=e5] [cursor=pointer]
    - main:
      - text: · 当前
      - generic: 连续清场成长；普通感染体追击你，潜伏体侵蚀中央组织。每 5 波迎战精英。
      - generic:
        - generic:
          - generic: Space
          - generic: 冲刺
          - emphasis: 就绪
        - generic:
          - button "1 精确净化" [pressed] [ref=e6] [cursor=pointer]:
            - generic [ref=e7]: "1"
            - strong [ref=e8]: 精确净化
            - text: 1 束 · 贯穿 +0
          - button "2 范围裂解" [ref=e10] [cursor=pointer]:
            - generic [ref=e11]: "2"
            - strong [ref=e12]: 范围裂解
            - text: 范围 94 · 击退
          - button "3 组织修复" [ref=e14] [cursor=pointer]:
            - generic [ref=e15]: "3"
            - strong [ref=e16]: 组织修复
            - text: 治疗 · +25 完整度
        - generic:
          - generic: Q
          - generic: 扫描 / 召集
          - emphasis: 就绪
      - generic: v0.8.11 · 连续进化挑战 / 微观绘本
      - generic: SEED 71 / 04:30
      - complementary:
        - generic:
          - generic: 我的进化 · 抗体构筑
          - generic: 清波获得协议经验
        - generic: 协议 Lv.2 · 60 / 95 XP
        - generic:
          - generic "Q 标记鼠标区域，召集三只临时免疫细胞。召集三只免疫细胞，持续 6 秒；活动范围 190，每 0.8 秒每轮总伤害 24。Q 对准敌体可短时优先围猎；没有指定目标时优先显影体。 独立冷却 12 秒；每次组织承压 −3；同时一支小队，替换后撤离。 Q 就绪时，指敌体短时优先围猎；指空地部署区域，细胞实际移动咬击。":
            - generic: ✚
            - generic: 免疫灯塔 Ⅰ
            - generic: 咬击 15
          - generic "基础工具清除感染体或感染源。清除后向 170 范围内邻体跳 2 次，每跳 38 伤害；共振破绽清除可增为 3 跳。 单体无邻体时无额外收益；跳跃检查视线，协议伤害不再开新链。 把感染体引到一起，用 1 / 2 收尾，观察净化电弧连续跳跃。":
            - generic: ⌁
            - generic: 连锁净化 Ⅰ
            - generic: 链 5 · 折 0
          - generic:
            - generic: "3"
            - text: 空协议槽
        - button "当前配装详情" [ref=e18] [cursor=pointer]
      - generic "连续挑战状态":
        - generic:
          - generic: ENDLESS / 连续挑战
          - generic:
            - strong: 第 3 波
            - generic: 已清 2 波
          - generic:
            - generic: "1"
            - generic:
              - text: 敌群剩余
              - generic: 场上 1 · 待入场 0
          - heading "第1轮 · 压力推进 · 聚群猎场" [level=3]
          - paragraph: 点射支援：窄线锁定后侧移；远距支援可接近射杀或朝它 Q 部署细胞，近处可用范围裂解打断。
          - paragraph: 普通病毒 · 每 5 波精英，下次第 5 波
          - generic:
            - generic: 得分 740
            - generic: 连击 0 · 最高 14
        - region "救援体和组织状态":
          - generic:
            - generic: 救援体耐久
            - generic: 100 / 100
          - generic:
            - generic: 组织完整度
            - generic: 97%
          - paragraph: 感染 0% · 全身稳定 100%
          - status: 3 瞄准组织抢修 · Esc 可主动撤离结算
        - generic:
          - strong: 战斗进化 Lv.2
          - generic:
            - paragraph: 1 · 1 束 × 34伤害 · 贯穿 +0 · 0.18s
            - paragraph: 2 · 半径 94 · 65伤害 · 1.2s
            - paragraph: Space · 冲刺斩未解锁 Q · 免疫小队
            - paragraph: 细胞伤害 ×1.4 · Q 2.42s · 已记录咬击 15次
        - generic:
          - strong: 战场导航
          - img "连续挑战小地图：白三角为你，橙三角为组织袭击者，加号为组织，菱形为阀门，方框为增援源，圆点为敌群"
          - paragraph: △ 你 ▲ 袭击者 ＋ 组织 □ 源
          - paragraph: 组织在南东侧 · 464m
```

# Test source

```ts
  42  |     requestAnimationFrame(observe);
  43  |   });
  44  |   const movement = new HeldMovement(page), deadline = Date.now() + 270_000;
  45  |   let state = await readState(page), tool = 0, guarding = false, sourceCut = false, distantGuardBite = false;
  46  |   let guardWave = 0, guardUntil = 0;
  47  |   try {
  48  |     while (Date.now() < deadline) {
  49  |       state = await readState(page);
  50  |       const guardReceipts = await page.evaluate(() => (window as unknown as { __guardQa: unknown[] }).__guardQa);
  51  |       if (guarding && guardReceipts.length && !distantGuardBite) {
  52  |         distantGuardBite = true; observations.push({ distantGuardBites: guardReceipts });
  53  |       }
  54  |       for (const target of state.targets) if (target.assaultObjective === 'tissue') raiders.add(target.id);
  55  |       for (const event of state.events) {
  56  |         const key = `${event.tick}:${event.type}:${JSON.stringify(event.data)}`;
  57  |         if (seen.has(key)) continue; seen.add(key);
  58  |         if (event.type === 'ACTOR_SPAWNED' && event.data.assaultObjective === 'tissue') raiders.add(String(event.data.id));
  59  |         if (event.type.startsWith('IMMUNE_') || event.type.startsWith('ENDLESS_SOURCE_') || event.type === 'COMBAT_UPGRADE_COMMITTED') events.push(event);
  60  |         if (event.type === 'TARGET_HIT' && raiders.has(String(event.data.id)) && Number(event.data.damage) > 0
  61  |           && event.data.cause === 'protocol' && event.data.protocolId === 'IMMUNE_BEACON' && String(event.data.rootId).includes(':cell:')) {
  62  |           events.push(event);
  63  |         }
  64  |       }
  65  |       expect(state.phase, state.result?.reason).not.toBe('result');
  66  |       if (state.growth?.draft) {
  67  |         await movement.release(); await page.mouse.up(); tool = 0;
  68  |         await chooseDraftInput(page, ['IMMUNE_BEACON', 'EXPOSE_TRACE', 'PURIFY_CHAIN', 'PULSE_BREAK']); continue;
  69  |       }
  70  |       if (state.endlessGrowth?.draft) {
  71  |         await movement.release(); await page.mouse.up(); tool = 0;
  72  |         const priorities = ['immune', 'multishot', 'power', 'nova', 'pierce', 'haste', 'scan', 'dash', 'vitality', 'catalysis'];
  73  |         const option = state.endlessGrowth.draft.options.slice().sort((a, b) => priorities.indexOf(a.id) - priorities.indexOf(b.id))[0];
  74  |         await page.locator(`[data-action="endless-upgrade"][data-upgrade="${option.id}"]`).click(); continue;
  75  |       }
  76  |       if (state.phase === 'paused') { await page.locator('[data-action="continue"]').click(); continue; }
  77  |       const source = state.endless!.source;
  78  |       if (!guarding && source?.status === 'active' && (state.endlessGrowth?.ranks.immune ?? 0) >= 3) {
  79  |         if (distance(state.player, state.tissue) > 180) {
  80  |           await movement.release(); await page.mouse.up(); tool = 0; await walk(page, state.tissue, 120); continue;
  81  |         }
  82  |         if (state.endless!.phase === 'combat' && state.scanReady <= state.elapsed) {
  83  |           await movement.release(); await aim(page, state.tissue); await page.keyboard.press('KeyQ');
  84  |           const after = await readState(page);
  85  |           if (after.growth?.beacon?.guard) {
  86  |             guarding = true; guardWave = after.endless!.wave; guardUntil = after.growth.beacon.until;
  87  |             observations.push({ guardAccepted: after });
  88  |             await expect(page.locator('#endless-ability-3')).toContainText('正在驻防组织');
  89  |             await page.screenshot({ path: info.outputPath('guard-order-and-assault.png') });
  90  |             await page.mouse.up(); tool = 0; await walk(page, source.position, 280); continue;
  91  |           }
  92  |         }
  93  |       }
  94  |       if (guarding && state.endless!.wave === guardWave && source) {
  95  |         if (source.status === 'destroyed') sourceCut = true;
  96  |         if (distantGuardBite && sourceCut) {
  97  |           await movement.release(); await page.mouse.up();
  98  |           observations.push({ guardAndSource: state });
  99  |           await page.screenshot({ path: info.outputPath('cells-defend-player-clears-source.png') }); break;
  100 |         }
  101 |         expect(state.elapsed, 'Original guarded squad expired before the natural distant interception').toBeLessThan(guardUntil);
  102 |         const target = state.targets.find(target => target.id === source.id && target.hp > 0);
  103 |         if (target) {
  104 |           const gap = distance(state.player, target);
  105 |           if (gap > 510) { await movement.release(); await page.mouse.up(); await walk(page, target, 280); continue; }
  106 |           await aim(page, target);
  107 |           if (tool !== 1) { await page.keyboard.press('Digit1'); tool = 1; }
  108 |           await page.mouse.down();
  109 |         } else await page.mouse.up();
  110 |         // Keep the actual original order; a routine Q would redirect the guard.
  111 |         await page.waitForTimeout(70); continue;
  112 |       }
  113 |       const live = state.targets.filter(target => target.hp > 0).sort((a, b) => distance(state.player, a) - distance(state.player, b));
  114 |       const target = live.find(target => {
  115 |         const gap = distance(state.player, target), block = wallHit(state.player, normalized(target.x - state.player.x, target.y - state.player.y), gap, activeWorld(state));
  116 |         return block === null || block >= gap - target.radius;
  117 |       });
  118 |       if (target) {
  119 |         await aim(page, target);
  120 |         if (state.scanReady <= state.elapsed) await page.keyboard.press('KeyQ');
  121 |         const desiredTool = live.filter(other => distance(other, target) < 100).length >= 3 && state.cooldowns[2] <= state.elapsed ? 2 : 1;
  122 |         if (tool !== desiredTool) { await page.keyboard.press(`Digit${desiredTool}`); tool = desiredTool; }
  123 |         await page.mouse.down();
  124 |         const danger = live.find(enemy => enemy.attackPlan && enemy.tactic !== 'mimic-corrosion');
  125 |         if (danger?.attackPlan) {
  126 |           const line = normalized(danger.attackPlan.aim.x - danger.x, danger.attackPlan.aim.y - danger.y);
  127 |           await movement.move(-line.y, line.x);
  128 |           if (state.player.dashReady <= state.elapsed) await page.keyboard.press('Space');
  129 |         } else {
  130 |           const gap = distance(state.player, target), sign = gap < 180 ? -1 : gap > 440 ? 1 : 0;
  131 |           await movement.move((target.x - state.player.x) * sign, (target.y - state.player.y) * sign);
  132 |         }
  133 |       } else {
  134 |         await page.mouse.up(); tool = 0; await movement.move(0, 0);
  135 |       }
  136 |       await page.waitForTimeout(70);
  137 |     }
  138 |   } finally {
  139 |     await movement.release(); await page.mouse.up(); state = await readState(page);
  140 |     writeFileSync(info.outputPath('natural-tissue-guard.json'), JSON.stringify({ scope: 'Actual offline DOM input, ordinary offered upgrades, guard then deliberate source route; no state injection. Not a route-balance,16-wave browser or human-fun result.', guarding, guardWave, sourceCut, distantGuardBite, events, observations, final: state, errors, remote }, null, 2));
  141 |   }
> 142 |   expect(guarding && sourceCut && distantGuardBite).toBe(true);
      |                                                     ^ Error: expect(received).toBe(expected) // Object.is equality
  143 |   expect(errors).toEqual([]); expect(remote).toEqual([]);
  144 | });
  145 | 
```