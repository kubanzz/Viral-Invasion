import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),catalogPath=resolve(root,'production/prompt-catalog.json');
const catalog=JSON.parse((await readFile(catalogPath,'utf8')).replace(/^\uFEFF/,''));
const common='依据实际输入的验收透明母图像素和批准概念图，制作同一奇幻体内生态世界的单体演员源稿。软哑光二维手绘，暖棕描边、珊瑚/奶白/薄荷/灰紫大色块，保持同样头身体块、笔触和左上柔光。无镀铬、碎亮斑、霓虹描边、熔岩发光核、长触须、多足拼装。单体完整全身，浅三分之四轻俯视，逻辑512方画布，落脚[256,435.2]，留安全边距。真透明；通道无alpha则均匀纯白底，不画棋盘格或纸纹。无地面投影、平台、文字、UI、攻击/治疗光束或粒子。';
const base='sources/enemy/basic/master_v02.png',immune='sources/immune/front_right/master_v01.png';
const rows=[
 ['fantasy.actor.immune.back_right.master',immune,'把输入叶帽奶白豆团的同一身份转为真实后右视角，面向右上，主要看见后脑/背部与顶部大薄荷叶帽、两只短叶鞋；背面不要绘制正面双眼/嘴/胸前医疗十字，前侧标记最多只在侧缘局部可见。保持豆团比例、叶帽结构与奶白材质，不把front图旋转或镜像当背面。'],
 ['fantasy.actor.enemy.thinRay.master',base,'普通珊瑚圆病毒的短喷口变体：保留窄琥珀眼/压眉、深色咧口与短小牙、近圆短刺身。面部前侧长一个清楚短粗的有机喇叭鼻/短喷口，形成不同轮廓；喷口是软组织，不是金属枪炮，不画光束。24-32px能看清短喷口与敌方面孔。'],
 ['fantasy.actor.enemy.carapace.master',base,'普通珊瑚圆病毒的晶壳变体：保留同一珊瑚近圆短刺身体、窄琥珀眼压眉深口；正前方有宽厚的灰紫晶石前盾，三块大晶壳包住前半身但给眼口留清楚缺口。轮廓宽盾/大晶面，不用全身细碎尖刺，不变多足生物。24-32px晶壳轮廓清楚。'],
 ['fantasy.actor.enemy.fission.parent.master',base,'珊瑚短刺病毒的裂殖母体：双泡/双核囊体，两枚接连的圆泡有明显中间收腰，分别有简化凶萌琥珀眼，主泡深口两小牙；双泡构成轮廓而不是普通圆体侧面添小装饰。保留短刺和哑光珊瑚材质，无长触须无金黄核，不画分裂粒子。'],
 ['fantasy.actor.enemy.fission.child.master',base,'裂殖后的幼小单泡病毒：比普通体少且更短的圆芽突起，简洁珊瑚单球和清楚窄琥珀敌眼/一张小深口，头身体块仍同一家族。完整单泡不是缩小一张双泡原图，不画出生光效或影子。'],
 ['fantasy.actor.enemy.mimic.master',base,'拟态病毒：同族珊瑚圆体被一层不对称灰紫薄叶披膜罩住上部和一侧，兜帽式下垂轮廓，叶膜柔软哑光；窄眼压眉和深口从前侧明确露出，不能像无敌护盾。靠披膜轮廓区分，不只是给普通球换紫色。'],
 ['fantasy.actor.immune.beacon.master',immune,'新免疫信标是一座低矮生根式奶白/薄荷芽台，短根、三片宽叶、中央一个实体小医疗十字标牌，和叶瓣免疫豆团同材料。没有眼睛、四肢、机器人头或枪，不像第二台机器人；不画范围圈、光柱或地面阴影。'],
 ['fantasy.actor.weapon.emitter.master',null,'独立医疗喷射器单件源稿，完整粗短圆筒，暖奶白与深灰蓝哑光外壳、薄荷绿透明药液仓、简洁握把，枪管水平朝+X右侧，轻微三分之四可见上面。无角色或手、无粒子/光束/充能环。握把与枪口清楚可定位，物件位于512方画布中部留白，不使用演员落脚要求。'],
 ['fantasy.actor.enemy.addon.spore_crown.master',base,'只画侵染者附件一套：灰紫孢子背囊和两支短分枝芽冠，来自同族短刺病毒的有机哑光材料。输出仅附件，不画基础病毒身体、眼口、地板或光效；512共同注册画布，在输入病毒上缘/后肩对应位置放置，透明空白处保留给基础身体。附件不能遮住前脸、晶壳前盾或双泡轮廓。'],
 ['fantasy.actor.enemy.elite.fungal_horns.master',base,'只画精英附件一套：两枚清楚短粗菌角和低矮菌冠，暖灰紫哑光，简单大形。输出仅附件、不画基础身体和眼口；512共同注册画布，在输入病毒头顶上方位置放置，留出前脸/晶壳/裂殖特征。无发光轮廓、尖锐大恶魔角或金黄熔岩。'],
 ['fantasy.actor.mother.master',base,'奇幻生态母巢，低宽圆润花巢形：珊瑚色根托、层叠灰紫菌瓣与两三个柔软侧囊，中心一个集中清楚的珊瑚/奶油种核弱点。大形哑光，少量大菌瓣分层，拒绝满身发光笼架、蛛腿、写实脏器、满图散布小核。保留清楚的根部支撑。逻辑1024方画布，锚点[512,870.4]（覆盖通用512设置），主体有大留白便于后续分层，单体无背景无投影无特效。'],
];
for(const [id,reference,description] of rows){
 if(catalog.assets.some(a=>a.id===id))continue;
 const row={id,kind:'source-master',runtime:false,runtimeFrameCredit:0,status:'prompt-ready',prompt:common+'\n'+description};
 if(reference){row.identityReference=reference;row.identityReferenceSha256=createHash('sha256').update(await readFile(resolve(root,reference))).digest('hex');}
 catalog.assets.push(row);
}
await writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({sourcePromptCount:catalog.assets.length,added:rows.map(r=>r[0])}));
