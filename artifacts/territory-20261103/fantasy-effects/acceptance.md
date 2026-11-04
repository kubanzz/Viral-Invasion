# 程序特效与 fallback 验收记录

本轮只改渲染、相关包络和原生 UI 图标。未改伤害、射程、碰撞体、前摇时间、敌人计划、人口上限或游戏规则；未生成新图片。

## 已落实的视觉差异

- 普通弹为小奶白药滴，能量炮为带薄荷药斑的圆药团，飞行剑气为有双尖的实心月牙。去除共用长霓虹拖尾、外圈发光和炮弹旋转光环。
- 实际挥斩为单片收尖奶白弧，外边仍按真实半径、扇角和墙体逐点裁剪。炮击的淡色落地范围仍用已接受事件的真实半径，低特效保留。
- 扫描为单圈墨绿反馈，修复为绿色圈和奶白十字；颗粒改为较短、较少的药点。旧 PNG FX 是否停止由 native renderer 所有者集成确认。
- 蓄力用近身 3/5 片小叶瓣提示真实齐射数量和方向，不画看似连续伤害区域的装饰扇面。真实剑气的射程、半径和碰撞继续由释放后的 projectile body 决定。
- 程序角色分别改成大面罩奶白机器人、圆身短芽病毒、宽壳晶壳、双瓣裂殖体、异形潜伏体、奶白叶瓣免疫细胞、低矮根生信标。母巢 fallback 去长晶刺/披风，用圆身、短根与一个明确核心。
- 原生母巢和免疫的 accents 不补画身体、核心或细胞核。真实咬击、血量/寿命、护甲朝向和暴露仍保留。
- 玩家仅在遮挡/危险条件成立时用窄奶白/墨绿定位线，移除旧青蓝光边。fallback 包络同步了药罐、枪口、圆体与短壳，未改 collider。
- dash/scan/heal/chain 四个 UI 图标改为代码原生 SVG，不再依赖旧美术 atlas；名称、键位、ARIA、16/18px 盒尺寸和布局保留。artTheme.css 未改。

## 同尺寸截图

`before-report.json` 和 `after-report.json` 使用同一个序列化固定 fixture：

`SHA256 6f7927bbf0843a750d6f4736872563385a9504f2a6d514a876e7e084134f2cdb`

这是实际 CanvasScene/导出绘制函数渲染的技术样例，含 48 个提供的敌人和代表性弹体/挥斩。不是自然游玩录像，也不是手机硬件结果。

| 内容 | Before | After |
| --- | --- | --- |
| 1366×768 常规 | before-1366x768-normal.png | after-1366x768-normal.png |
| 1366×768 低特效 | before-1366x768-low.png | after-1366x768-low.png |
| 844×390 常规/低特效 | before-844x390-normal/low.png | after-844x390-normal/low.png |
| 667×320 常规/低特效 | before-667x320-normal/low.png | after-667x320-normal/low.png |
| 1000×650 双地色轮廓、药滴/药团/剑弧 | before-gallery-normal/low.png | after-gallery-normal/low.png |

附加 after 样例：`after-mother-scan-repair-normal.png`、`after-mother-scan-repair-low.png`、`after-native-icons.png`。前两张是提供状态直接调用绘制函数；图标使用实际 markup/install 函数，并验证重复安装仍只有一个样式注册。

已人工查看常规全场、667×320低特效、双地色图集、母巢/扫描/修复和实际16/18px图标。投射物轮廓差异明显，程序玩家/细胞/信标不再共享机器人外形；低特效关键危险环仍可见。

## 验证与限制

- `tsc --noEmit` 通过。
- `unit-final.json`：11 个相关测试文件、94 项通过。包括实际绘制路径对8个方向枪械包络的检查、各病毒及母巢填充路径包络、真实挥斩扇角/半径/裁墙、低特效炮击半径、原生身体不双画、真实危险/反制/枪口端点及完整状态不变。
- 截图 before 8 张、after 10 张加图标页，均无浏览器 pageerror，所有固定渲染样例完整 JSON 均未改变。
- 这里没有验证全新 native 角色帧、原生最终整包或手机硬件；这些需由整体集成验收覆盖。
- 667×320 的既有相机比例约 0.444，fallback 英雄约31px高、r18敌人约16px宽。形状区分已有改善，但面部和护甲细节仍偏小。本轮未改相机和布局，不能据此宣称小屏读图已经充分。
- 程序 walk 仍是既有脚步位移/bob，免疫仍是轮廓变形；本轮不把这些说成完整逐帧动作，也没有补造攻击/受击假帧。

复现：保留已有 before 产物，使用 bundled node 运行 `scripts/capture-fantasy-effects.mjs after`。运行 `before` 会重新用当前代码拍 before，不应覆盖本次基线。
