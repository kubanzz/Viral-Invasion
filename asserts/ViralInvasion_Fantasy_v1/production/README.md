# 素材处理与校验

本目录的 Node/Sharp 工具只写入本目录及其子目录，不修改原始输入、references、delivery.json、运行选择表或工程代码。生成图片到达前可运行内存自测；自测只使用程序构造的像素，不写图或调用生成服务。

```powershell
node asserts/ViralInvasion_Fantasy_v1/production/fantasy-art-process.mjs self-test
node asserts/ViralInvasion_Fantasy_v1/production/fantasy-art-process.mjs ground --input <原图路径> --id ground.heart --out output
node asserts/ViralInvasion_Fantasy_v1/production/fantasy-art-process.mjs cutout --input <原图路径> --id prop.healthy --out output
node asserts/ViralInvasion_Fantasy_v1/production/fantasy-art-process.mjs overlay --input <原图路径> --id overlay.ready --remove-white false --allowed-region 350,200,300,400 --out output
node asserts/ViralInvasion_Fantasy_v1/production/fantasy-art-process.mjs group --spec <状态组JSON路径> --out output
```

状态组 JSON 的 input 相对该 JSON 定位；使用相同源画布和统一变换，不能分别按透明包围盒定高、裁边或居中。

```json
{
  "inputs": [
    { "id": "facility.closed", "input": "raw/closed.png" },
    { "id": "facility.open", "input": "raw/open.png" }
  ],
  "options": { "removeWhite": true, "sourceAnchor": [0.5, 0.85], "scale": 1 }
}
```

不填 scale 时，以完整源宽缩放到1024，保持纵横比。源画布尺寸不同直接拒绝；源锚点默认(.5,.85)，输出1024×1024的声明锚点为(512,870.4)。统一缩放、偏移及实际落点记录在报告中；不会仅靠图像内容猜测脚点。可见像素将被裁断时直接拒绝。

地表固定输出1024×1024。将源图居中裁成512方形、降低饱和度/对比，再镜像成2×2，数值验证对边逐像素一致，并输出1536×1536的3×3观察图。镜像重复是否明显仍须看图评审；不将整张概念场景变成可用地形。参数为 --contrast、--saturation。

白底去除仅移除与画布边缘连通的近白像素，保护封闭白色身体/高光。默认阈值247、色差12，边缘清理只处理两像素近白边；用局部内侧颜色估计白色混合，得到真实部分alpha。已有半透明颜色不二次去白。可用 --white-min、--chroma-max、--edge-width 或 --matte-cleanup false 调整。白色主体若与白底直接相连，自动算法无法可靠分辨，必须检查黑/白底QA，必要时退回原图重做，不能把残留白边或棋盘格当透明。

单体/状态组输出真RGBA PNG及黑底、白底、灰度alpha、黑白并列四份预览。灰度alpha直接来自实际通道。overlay不添加地板或阴影；检查真实透明、空画布边缘，并支持allowedRegion与forbiddenRegions对已知区域严格验收。像素检查不能证明语义上的阴影/地板不存在，仍需目检，不自动抹掉主体像素来伪造通过。

每项报告包含原图和结果SHA256、字节、尺寸、alpha计数、半开bbox、亮度均值/标准差、处理方法；地表另有对边RMS和最大差值。报告只在production内。`inspect`会将输入转为PNG副本存到production并生成QA，使用前应确保这是所需行为。原图不受修改；输出路径拒绝跳出production，拒绝沿符号链接/目录联接写入。
