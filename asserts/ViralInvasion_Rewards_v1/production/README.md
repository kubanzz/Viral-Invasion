# Rewards v1 图标处理

四件运行文件固定为 icons/module-{PULSE_BREAK,PURIFY_CHAIN,IMMUNE_BEACON,EXPOSE_TRACE}.png，256² RGBA，最长有效alpha轴默认208px（允许192–217），居中、完整轮廓、透明留边至少8px。

源输入格式见 process-rewards-art.mjs 顶部。sourceReview必须实际看过源图。alphaMode=preserve只用于真实原生alpha；alphaMode=neutral-connected需逐图显式whiteMin/chromaMax，按边缘和已目检holes连通去底。protectedPolygons可保护浅奶油实体高光，不能把背景纸面包进保护区。edgeUnmatte=true只对紧贴外缘的一层像素做白底反混合，须目检；alphaMinComponentPixels按8邻接微点去除，保留所有达阈值的独立实体。全部参数和每组件尺寸写入处理记录。

不把白底抠图称原生透明，不把RGB隐藏色造成的查看器光晕当成实际alpha问题；使用真正flatten后的黑/奶油双底检查。只有透明画布裁切用于单图居中注册，不裁实体。原始图、生成run/node/canvas/model/提示词与存储来源一起记录。

输出256黑底/奶油底/双底、alpha、64px透明/双底QA。逐项实际目检后在 final-visual-review.json 写入 reviews 条目：key、sourceVersion、outputSha256、passed=true、reviewer，以及 checks.blackBackgroundInspected/creamBackgroundInspected/noWhiteFringe/creamHighlightsPreserved=true。组装器重新读取所有成品、原图及QA哈希后交付delivery.json，mainRendererApproved保持false。

本工具与旧包完全隔离，不生成图片，不触碰Microfront、游戏代码、公共art-selection或已有角色。
