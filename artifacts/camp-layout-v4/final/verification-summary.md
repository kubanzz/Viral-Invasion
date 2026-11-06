# 营地 v4 最终独立验收

结果：通过。完整证据为 `report.json`。

| 范围 | 结果 |
| --- | --- |
| 生产Renderer显式场景 | 1366×768、844×390、667×320，各总览与门前，共6视图通过 |
| 主入口真实输入路线 | 三尺寸各34段真实移动、四设施交互、暂停/关闭恢复、菜单重入、出击战斗后回营通过 |
| 手机恢复 | 844×390与667×320旋转回横屏后，真实摇杆分别移动约27.42与23.50世界单位 |
| 实际dist离线构建 | 桌面与844×390分别进入营地、真实走进整备院并打开仓库；0远端请求、0页面错误 |
| 新美术实际使用 | 3地表均观察到真实院落尺寸的drawImage调用；新forge native frame被使用，无旧石砧回退 |
| 比例 | 仓库/玩家真实可见高度比约2.604，三尺寸一致 |
| 构建身份 | 签名3a0944e29983c3f4d5d90286fd6d66b6770fe28a60754fe5f37a51ea284bafe3；281 sprites、11 environments |
| 防漂移 | 生产source前后稳定；实际dist输出与build-meta吻合，烟测前后未变 |

实际游戏主入口截图：

- `dist-desktop-1366x768-camp.png`：真实dist桌面全画面。
- `dist-touch-844x390-camp.png`：真实dist手机横屏局部镜头。
- `live-touch-667x320-forge-approach.png`：小屏走到新工坊的近景。

资格fixture由当前CampProfileStore正常beginExpedition、settleVictory、finishCampIntro生成后导入新的隔离浏览器存储；不声称自然通关。进入页面后只读取只读diagnostics，使用真实键盘/可信触控输入，不注入玩家、时间或库存。本结果不替代实体手机或真人理解度验证。
