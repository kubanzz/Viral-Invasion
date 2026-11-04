import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),file=resolve(root,'production/prompt-catalog.json');
const c=JSON.parse(await readFile(file,'utf8')),reference='sources/hero/front_right/master_v03.png';
const hash=createHash('sha256').update(await readFile(resolve(root,reference))).digest('hex');
if(hash!=='2c75e43f1574900eb0325c219b04296b0780cc07f90e5906f3d91da66a8ce876')throw Error('v03 reference changed');
const row={id:'fantasy.actor.hero.front_right.hold.master',kind:'source-master',runtime:false,runtimeFrameCredit:0,identityReference:reference,identityReferenceSha256:hash,
 prompt:'任务：基于实际输入的同一英雄透明参考图，只重绘双前臂和双手，制作胸前居中持枪预备姿的空手身体母图。正前右三分之四轻俯视，面向右下，完整全身，独立单体。\n【保持不变】严格保留参考图的奶白大头盔、同一深面罩与两个薄荷眼、头盔上的大深薄荷医疗十字、灰蓝短四肢、薄荷胸块、奶白薄荷软哑光手绘材料、身体头身比例、双腿与原脚点。头部、表情、躯干和脚的形状不能重新设计，不能缩小医疗章。\n【唯一姿态修改】从上臂的自然位置延伸，两肘自然弯曲向身前收拢；两只小巧的C形握持手位于胸腹前，靠近身体中轴，成为双手准备握住一把独立短医疗喷射器的姿态。双手不要在身体左右两端摊开，不要一只手垂到胯边。逻辑512方画布中，实际双手之间的持握中心靠近横向256上下12像素、高度315附近，胸前留有清楚的握持空位，两只手要有拇指和弯指。用自然重绘关节与遮挡实现新姿态，不扭曲或平移旧手臂贴图。\n【注册与画面】保留参考完整方画布和脚锚布局，脚点在逻辑坐标256、435附近，留安全边距；保持同样的轻俯视角度和左上柔光。真透明，若不支持透明则纯白平底；不画白色棋盘格或纸纹。\n【禁止项】只画空手身体，禁止任何枪、武器、工具、药液罐、光束、粒子、地面投影、平台、背景、文字、编号、UI或水印。禁止重画头脸、改变身体大小、改成金属镀铬、长天线、霓虹或写实材质。'};
if(!c.assets.some(v=>v.id===row.id)){c.assets.push(row);await writeFile(file,JSON.stringify(c,null,2)+'\n');}
console.log(JSON.stringify({id:row.id,reference,sha256:hash}));
