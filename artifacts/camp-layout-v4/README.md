# 营地 v4 独立验收证据

## 最终验收

`final/report.json` 为冻结四图与生产源码后的完整通过报告：6个显式生产Renderer视图、3个尺寸的生产主入口完整真实输入路线、2个真实 `dist/index.html` 离线烟测。实际dist截图为 `final/dist-desktop-1366x768-camp.png` 与 `final/dist-touch-844x390-camp.png`。3尺寸全路线均走到四设施并打开正确面板，检查暂停、旋转恢复、回菜单重入、出击战斗再回营，以及账本不因参观与移动而改变。

最终runtime签名为 `3a0944e29983c3f4d5d90286fd6d66b6770fe28a60754fe5f37a51ea284bafe3`，含281个sprite、11个environment。所有3个营地ground均由观察性原生 `drawImage` 代理记录到对应真实院落尺寸的调用；代理原样调用原方法，不改变绘制参数或模拟输入。新工坊使用 `fantasy.camp.forge.fixed.ready.00` 且无回退。真实dist输出与其build-meta记录一致，加载期间未改变；生产源码前后哈希稳定。全部页面错误、远端请求为0。

此验收仍明确使用隔离营地资格fixture，并不是自然通关证明或实体手机测试。两个dist烟测使用根构建的实际 `dist/index.html`，不是脚本自行构建的source-live入口；其余三尺寸全路线使用当前生产入口的独立测试构建。完整报告区分两种输入。

## 早期证据

`pilot-complete/report.json` 是当前三尺寸完整 pilot：1366×768、844×390、667×320。包括6张生产 Renderer 显式场景截图，以及3组生产主入口的真实键盘/触控路线。各路线均穿过真实院门，走到四设施后以E或近设施按钮打开面板；验证面板暂停、恢复无粘键、触屏旋转后继续移动、回菜单与重入、奖励账本不变、出击恢复战斗比例及离线无远端请求。该轮通过，但工坊仍为旧石砧回退图，不能作为最终新美术验收。

营地资格来自隔离档案 fixture：使用当前 `CampProfileStore.beginExpedition()`、`settleVictory()`、`finishCampIntro()` 正常生成后导入新的浏览器 context。未模拟自然击败Boss或通关；进入页面后不写玩家、时钟、战场状态或库存。独立源码渲染 fixture 的提供站位与真实输入路线分别记录。

`pilot-live` 保留早期旋转检查失败原报告。该检查只按墙钟等待150ms且未等待旧面板DOM实际移除，不能据此认定生产移动故障。后续 `pilot-rotation` 与 `pilot-complete` 等待面板消失，并按真实模拟时钟计时，记录触点命中元素、焦点、前后坐标与位移后通过。

脚本：`scripts/verify-camp-layout.mjs`。最终执行命令为 `node scripts/verify-camp-layout.mjs --label=final --built-dir=dist`。默认构建当前生产入口的经典离线包作为source-live测试输入；`--built-dir=dist` 另行核验根生成的实际离线构建。`--entry=绝对路径` 可指定source-live入口，`--case=touch-667x320` 可定向运行，`--render-only` 只运行独立渲染检查。此处没有发行ZIP验收，未将早期pilot报告改写为final。
