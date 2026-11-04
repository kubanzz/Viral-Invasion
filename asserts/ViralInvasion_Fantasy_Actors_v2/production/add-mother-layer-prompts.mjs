import {readFile,writeFile}from'node:fs/promises';
import{dirname,resolve}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),file=resolve(root,'production/prompt-catalog.json'),c=JSON.parse(await readFile(file,'utf8'));
const ref='production/processed/masters/fantasy.actor.mother.master.png',hash=createHash('sha256').update(await readFile(resolve(root,ref))).digest('hex');
const common='任务：依据实际输入的同一母巢参考图，为二维手绘游戏生成一张可叠加的独立有机附件层。只画指定附件，不画参考图中的完整母巢、根托、中心种核或背景；附件以外全部透明，如不支持透明则均匀纯白。保留参考母巢的灰葡萄紫、暖奶白和珊瑚色、暖棕手绘边线、柔哑光大笔触、同一左上柔光和轻俯视三分之四视角。逻辑1024方画布，参考母体的足点在512、870；部件按下述位置摆在原方画布，保留周围大片空白，不自动放大铺满画布。禁止文字、棋盘格、UI、阴影、地面、光圈、能量场、金属、霓虹、魔法粒子和完整母体。\n';
const rows=[
 ['membrane','独立软膜：一片很薄的灰紫有机保护薄膜边沿，形似自然花口的浅碗唇缘，由少量分叉菌脉支撑；中心大片镂空透明，不能画成实心花球或整株花。薄膜围绕逻辑中心512、430，外缘宽约480、高约270；薄边有手绘褶皱和克制半透明质感。'],
 ['carapace','独立有机甲壳：三片厚实的灰紫贝壳状菌壳板，互相叠接为向前闭合的低矮护盖，外缘圆钝，少量大刻面与天然菌脉。护盖中心逻辑512、460，总宽约400、高约250，给上端中央留窄缺口；只画三块护甲，周边空白，不能复制花瓣底座或做全母体。'],
 ['fission','独立裂殖附件：两枚彼此分离的珊瑚奶白双叶菌囊，鼓起的圆润种荚，短粗软茎贴近母巢两侧，左囊中心逻辑270、640，右囊中心760、620，各宽约180、高约200。画两个大囊芽及很短连接茎，囊中间保留大片透明空间；不画基础母巢、不画角色脸或散落小核。'],
 ['mimic','独立拟态披膜：三片灰紫宽叶菌瓣自然垂挂形成一件低矮有机叶披，顶部在逻辑512、280、下缘到约580，总宽约440；有明显不对称下垂的轮廓，能罩住母巢花口上部。只画这一层叶披及少量菌脉，不画完整花体、根、中心种核或第二个母巢。'],
];for(const[name,prompt]of rows){const id='fantasy.actor.mother.'+name+'.layer.master';if(!c.assets.some(v=>v.id===id))c.assets.push({id,kind:'source-layer',runtime:false,runtimeFrameCredit:0,identityReference:ref,identityReferenceSha256:hash,prompt:common+prompt});}
await writeFile(file,JSON.stringify(c,null,2)+'\n');console.log(JSON.stringify({added:rows.map(v=>v[0]),referenceHash:hash}));
