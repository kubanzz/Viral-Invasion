# 营地交互、提示与逐座建设

2026-11-06。首次进入缓流膜湾时，先带队抵达中央锚，再分别确认建设五座基础建筑。五座均免费，可自由决定顺序，每座施工两秒；只有当前栋可以跳过演出。全部落成后出击台收到第一份情报。已完成旧序章的玩家保留完整营地。

## 玩家可见的变化

- 从建筑前、后、左、右接近均可操作。点击屋顶、主体、名称或提示打开对应建筑，E键使用最近设施；院墙和其他建筑仍阻止隔墙交互。
- 新情报显示蓝色感叹号，新可用型号或更高品质装备显示金色感叹号，查看对应内容后确认已读。低品质重复装备、初始武器不会反复提醒。
- 锻造台按可修复、可打造、可强化显示当前操作；打造同时检查碎片、生质和核心。查看面板不会消除仍可执行的操作提示。
- 未建和施工中的地块只有规划地基与脚手架，不会提前出现成品建筑或碰撞。每院基础建筑齐备后才补齐地面、围墙与装饰；落成时会把被新碰撞覆盖的玩家移到合法空地。
- 施工中刷新保留已建和当前施工项目，当前栋重播两秒演出；打开面板暂停场景，关闭后继续。

## 规则与存档接口

`campProgression.ts` 集中保存建筑几何、用途、入口、前置条件与首次建设标识。新手必建列表固定为当前五座，后续增加建筑不会自动重新锁住出击；本次没有增加战力公式或新的建设货币。

营地存储键继续使用 `viral-invasion:1:camp-profile`，内容升级为schema 3。新增已建建筑、当前施工建筑、已读任务及每个装备型号已确认的最高可用品质。建设开始与完成各保存一次，重复请求不重复落成，保存失败保留本页状态并支持重试。

`CampProfileStore.beginBuild/completeBuild/markCampSectionSeen` 处理建设与已读；`campStationAttention` 统一推导世界标记、菜单和快捷按钮。世界点击使用实际素材投影与标签最终位置，先选中可见目标，再检查距离，避免提示覆盖另一栋建筑时误开。

## 验证与交付

- [定向回归](../artifacts/camp-building-20261106/final-unit.json)：22文件、326项通过。
- [广泛回归](../artifacts/camp-building-20261106/broad-unit.json)：211文件、2161项通过。未包含耗时的 `full-system-seeds.test.ts`；首次广泛检查中的种子审计运行约九分钟后中止，不能据此宣称全系统种子压力审计通过。三个计时超时文件的[串行复测](../artifacts/camp-building-20261106/timeout-retest.json)15项通过。
- [最终桌面包三尺寸真实输入](../artifacts/camp-building-20261106/verification-summary.json)：1366×768、844×390、667×320，分别覆盖新档、旧schema 2和独立经济夹具，九个行为场景全部通过。[原始R2报告](../artifacts/camp-building-20261106/package-final-r2/report.json)保留源码冻结断言失败：测试期间其他任务更新了工作区主入口；已在运行前封存、运行后复核桌面产物哈希与ZIP，冻结产物没有变化。夹具不作为自然获得装备的证明。
- [最终包自然实战](../artifacts/camp-building-20261106/package-natural/report.json)：新档建五栋、实际生成并击杀240个基础敌体、首次任务成功、回营打造蓝色共振模组、装入模组并再次出击纤维回廊。
- [手机单HTML完整路线](../artifacts/camp-building-20261106/mobile-package-final-input-recovery/report.json)：667×320触屏，覆盖施工刷新恢复及侧面、背面屋顶点击。前次驱动触点停滞记录保留，复测不替换失败报告；验证驱动只在实际触点已释放时重新按下摇杆，不改写游戏状态。
- [最终包启动与刷新](../artifacts/camp-building-20261106/package-runtime-smoke-final.json)：桌面与移动分别检查断网启动、刷新、六名队员及角色/武器3D就绪，HTTP请求、页面与控制台错误均为0。

触屏验证使用浏览器模拟触屏，不代表实体手机试玩。试玩包是冻结的已验证构建快照，输入信息记录在[构建清单](../artifacts/camp-building-20261106/build-meta.json)。打包后的并行主入口和接引样式更新保留在工作区，不能宣称这些后续改动已包含在本包或经过本轮路线验收。本次基础建设不额外消耗装备经济资源。

[桌面离线ZIP](../artifacts/camp-building-20261106/Viral-Invasion-Camp-20261106.zip)经过独立ZIP解码与逐字节比对；[手机单HTML](../artifacts/camp-building-20261106/mobile/Viral-Invasion-Mobile.html)及[手机ZIP](../artifacts/camp-building-20261106/mobile/Viral-Invasion-Mobile.zip)通过原有打包校验。桌面包完整解压后双击 `Open-Game.cmd`，工作区也可运行 `Start-Game.cmd`。
