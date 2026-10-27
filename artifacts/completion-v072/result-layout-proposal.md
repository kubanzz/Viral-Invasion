# 结算首屏布局修正建议（仅静态提案）

日期：2026-10-27。只读审查了原失败图、错误上下文、CSS与host；未改生产/测试、未构建或启动浏览器。

## 已观察的问题

- 原始[失败截图](browser/attempt-1/output/g4-G4-complete-browser-see-ba143-tence-and-clean-seed-replay-chrome/test-failed-1.png)与[错误上下文](browser/attempt-1/output/g4-G4-complete-browser-see-ba143-tence-and-clean-seed-replay-chrome/error-context.md)。
- 1366×768中，原G4断言取得复盘summary底部794.140625，大于768。截图中的结果框约为y24到744；下一病例仍可见，复盘入口位于滚动区下方。
- 两维事实和下一病例方案追加到旧结果主体、操作区之后，最后才是details.profile-recap。旧主体的装饰和多处大间距累加后，折叠入口超出首屏。
- 仅上移27px满足视口边界仍可能被结果框overflow裁切。应使入口完整位于框内并保留底部padding，建议回收约90–110px。

## 推荐：只收紧结果装饰与节间距

限定 `.campaign-modal:has(> .profile-recap)`，或由host显式标记结果类。该直接子节点当前仅在结果追加，避免影响全局modal、帮助、研究、暂停或战斗HUD。

当前样式来源：

- `src/style.css`：seal字号37px/margin-bottom10px；stats上下margin28px；actions顶部margin25px；器官结果上下margin18px、卡片padding12px；primary纵向padding15px。
- `src/ui/profile.css`：结果框padding26px 30px；新两维事实正文10px两列；复盘summary已有padding8px 11px/line-height1.6。
- `src/ui/startingPlan.css`：下一病例行保留方案文字与按钮，不改内容。

以下是待根任务批准后实施的单一局部CSS包：

```css
.campaign-modal:has(> .profile-recap) {
  padding-block: 18px;
}
.campaign-modal:has(> .profile-recap) > .result-seal {
  font-size: 28px;
  line-height: 1.1;
  margin-bottom: 4px;
}
.campaign-modal:has(> .profile-recap) > .eyebrow {
  margin-bottom: 8px;
}
.campaign-modal:has(> .profile-recap) > .campaign-organ-results {
  margin-block: 12px;
}
.campaign-modal:has(> .profile-recap) > .campaign-organ-results > div {
  padding-block: 10px;
}
.campaign-modal:has(> .profile-recap) > .stats {
  margin-block: 14px;
}
.campaign-modal:has(> .profile-recap) > .actions {
  margin-top: 14px;
}
.campaign-modal:has(> .profile-recap) > .actions > .primary {
  padding-block: 11px;
}
```

静态估计回收：框padding16px、seal约20px、品牌4px、器官卡间距/内距约16px、stats28px、actions约19px，合计约103px。此为CSS尺寸估计，未运行布局；字体、换行与flex拉伸须实测。h2、正文、两维事实、初始方案、全部操作和summary本身字号与内容均保留。主操作仍约45px高，不缩成小字。

短窗1100×560、800×600继续有意使用结果框自身滚动，保留overflow:auto和max-height短窗规则。主要操作、下一病例、复盘展开和末端均须可达。另做sticky操作footer会牵涉host结构及遮挡，非此最小修复首选。

## 修正后保留的验证

1. `tests/e2e/g4.spec.ts:34–37`原断言不变：1366×768初始折叠入口无需自动滚动即可可见，展开及进入/返回档案正常。
2. 目视确认summary完整在结果框内；只有boundingBox底部小于768不能证明未被父overflow裁切。
3. 1920×1080维持密度；1100×560和800×600检查主要操作、方案及展开滚动可达。
4. CSS变更须重新构建并记录新hash。规则源码若逐字节相同，可明确沿用规则模拟；C截图和布局浏览器结果不能直接重标为新包。

冻结由根任务管理。本提案不代表已授权修改或浏览器修正通过。提案写入的首次Node文本命令因模板反引号语法错误退出1，没有写文件；随后仅用文件补丁写入本artifact，未触及源码。
