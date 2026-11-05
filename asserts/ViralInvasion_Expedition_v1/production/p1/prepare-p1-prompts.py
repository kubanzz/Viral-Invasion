"""P1 designs only. Writes solely to Expedition_v1/production/p1."""
from pathlib import Path
import hashlib, json

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[1]
OLD=ROOT.parent
FACILITY_STYLE=[OLD/'ViralInvasion_Fantasy_Combat_v3/sources/immuneCannon/fixed/master_v01.png',OLD/'ViralInvasion_Fantasy_v1/facilities/healing_node_healthy_v01.png']
WEAPON_STYLE=[OLD/'ViralInvasion_Fantasy_Actors_v2/sources/weapon/emitter/master_v01.png',OLD/'ViralInvasion_Fantasy_Actors_v2/sources/immune/beacon/master_v02.png']
STYLE='''【统一画法】仅匹配上传参考的2D软哑光水彩厚涂、暖棕细轮廓、奶白/薄荷绿/灰蓝晶岩与少量珊瑚色。大色块、简洁完整的圆润轮廓，24至32像素仍能辨认主体身份。不用高光金属、硬科幻装甲、写实细密组织、霓虹、发光边。'''
FACILITY_LAYOUT='''【候选构图】同一建筑左右各一款完整候选，正方形图中左款中心x25%、右款x75%，底部接地约y85%；两款不重叠，中央留白，完整建筑不得跨中线，不画标签编号或分隔线。前右四分之三轻俯视，固定方向，每款紧凑独立。最下方只有自身支脚/短根/底座，不画地块、阴影或圆盘。'''
OUTPUT='''【输出】均匀纯白#FFFFFF背景，供精确抠图；主体暖棕轮廓闭合，奶白部位不透明。完全不画烘焙投影、灰色地影、纸纹底、透明棋盘格、背景场景、人物、怪物、射弹、危害圈、范围圈、施工进度、UI、文字、水印、品质光效或装饰粒子。'''
DESIGNS={
'campTentWarehouse':'''【建筑】心脏安全营地的营帐兼仓库，安心且可使用的低矮奶白种皮帐篷。巨大一片薄荷绿厚叶作为拱顶，奶白荚壳作左右撑片，正面清楚的深薄荷半圆入口；入口一侧附一个与帐体连接的矮生质储物箱，箱盖有珊瑚色粗绑带。不是独立小道具堆，不画堆积货物，不画现代军用帆布、旗帜、文字标牌。左款为单叶拱顶的横宽低帐篷+右侧矮箱；右款为两叶合拢的圆润种荚仓帐+左侧内嵌矮箱。帐篷占主体，不要把仓箱做成更高建筑。''',
'campForge':'''【建筑】心脏安全营地锻造台，小尺寸必须由“灰蓝粗砧台+奶白瓣形炉罩”读出锻造工作台。低矮三块灰蓝晶岩撑住一块扁平厚砧面，一侧立着奶白有机壳包覆的短胖熔合炉，炉内是暗珊瑚色实体颜料，不发光、不画火苗烟雾。台面一把粗圆小锤可与台体连接放置，最多一个工具，不能散落道具。左款为横宽砧面+左后奶白半壳炉；右款为圆润砧台+右侧短粗叶瓣炉。顶部轮廓明确，非武器炮台，非医疗治疗花。''',
'campSupply':'''【建筑】心脏安全营地补给站，一个矮胖奶白生质储液筒和大薄荷叶遮棚。储液筒前有粗短实体补给口，筒身一条实色薄荷绿宽带，无刻度、无文字；补给口下是一只与底座连成一体的小托盘。底下两片短根和一块灰蓝晶岩，整体接近正方形。左款为短圆筒+单叶顶棚+前方托口；右款为双瓣奶白水囊+横向薄荷绿把手+侧面托口。不要治疗光束、光环、悬浮药丸、瓶堆、UI十字浮标或人物。''',
'campSortie':'''【建筑】心脏安全营地出击台，低矮宽阔的三瓣叶形台座，后方两片厚奶白荚壳形成短拱门，门洞是清楚的空置深薄荷开口；中央为完整的实体薄荷踏板，空无一人。造型像可踏入的生物通道起点，不像炮座，不画朝天发射槽、不画炮管。灰蓝晶岩只有两三块低矮支撑；不画圆形范围、箭头、传送光效、标记、地图面板。左款为双短壳拱+三瓣扇形踏板；右款为单宽壳遮檐+横宽双叶踏台。'''
}
sources={}
for key,design in DESIGNS.items():
    sources[key+'.candidates']={'entity':key,'role':'two-building-design-candidates','style_reference':[str(p) for p in FACILITY_STYLE],'prompt':'\n'.join([design,STYLE,FACILITY_LAYOUT,OUTPUT])}

sources['gunIcons.sheet']={
 'entity':'gunIcons','role':'normal-broken-matched-pair-sheet',
 'style_reference':[str(p) for p in WEAPON_STYLE],
 'prompt':'''【任务】画一张可裁分的四格武器物品素材，2行2列，四只独立完整针枪，没有边框、标签或文字。每格单只针枪完整，四周留白，所有枪口朝画面右上约20度，统一相同的三分之二侧视；每格物体不碰格边，互不交叠。
【第一行左：稳流针枪完好】短而稳重的奶白有机针枪，薄荷绿单个储液芯，短粗灰蓝握把，前端是一根清楚、短直而粗轮廓的奶白注射针式管，不是激光口或大炮。圆润奶白机身加一条深薄荷宽色带，细节少。最显著轮廓是短机身与短针嘴。
【第一行右：同一稳流针枪破损】必须保留第一行左款的相同外形、尺寸、朝向和色区。只把短针嘴明显折弯并断开一小段，薄荷储液芯出现一条粗暗裂痕，灰蓝握把完整。破损来自轮廓缺口与裂缝，不靠红色符号、警示UI或光效表达；不画散落独立碎片。
【第二行左：贯脉针枪完好】同系列但明显更修长的奶白针枪，双片薄荷绿纵向护片夹着一条珊瑚色短粗贯穿芯，枪口是长而平直的注射针式管，枪身长度明显大于稳流枪；握把依旧短粗灰蓝。最显著轮廓是长针嘴与双片护片，不加夸张机械齿轮。
【第二行右：同一贯脉针枪破损】保留第二行左款尺寸、角度、外形和色区，把长针嘴末端折断成清楚的短斜缺口，并让一片薄荷护片有一个较大的裂开缺口。其余部位保持同一身份，不变成另一种枪，不画散落独立碎片。
'''+STYLE+'\n'+OUTPUT
}
sources['materialIcons.sheet']={
 'entity':'materialIcons','role':'four-distinct-physical-item-icons',
 'style_reference':[str(p) for p in FACILITY_STYLE],
 'prompt':'''【任务】画四个可独立裁分的物品图标，2行2列，每格一个完整独立物品，周围安全留白，不画边框、格线、名称、数字或标签。四格物品互不交叠，统一轻俯视角和同等显示体积，是真实物品小插图而非界面卡牌。
【左上：基础弹射荚蓝图】一张实体奶白厚叶纸，两个对角自然卷起，纸面只画简洁的深薄荷线描“三瓣短种荚+低矮三石底座”物件草图。草图像绘在纸上的物体结构，不加文字、数字、尺寸箭头、网格或工程标注。以一条珊瑚色短绑带扣住卷角。
【右上：速装弹射荚蓝图】相同实体叶纸和角度，纸面是可一眼区分的“双对称叶片夹托+双层短底座”深薄荷物件线描，右上角多一个实色小薄荷叶扣。与基础图纸保持同一系列，不用发光、闪电、稀有度星星、边框或品质标记区分。
【左下：修复生质】一小团结实的奶白和薄荷绿生质修复材料，两个饱满细胞块黏合为单一物件，中央粗薄荷缝，顶部一片短小软叶。无脸、眼睛或肢体，不是角色，不画漂浮液滴、药瓶、十字UI或光环。轮廓略不规则，有完整暖棕轮廓，像可拾取的修复原料。
【右下：战利品包】一个低矮鼓起的奶白叶皮小包，珊瑚色粗带在袋口打一个大结，袋口露出一小块灰紫晶岩；包体主色完整，轮廓像一件单体战利品包。不要金币堆、散落道具、星星品质光效或浮空文字。
'''+STYLE+'\n'+OUTPUT
}

records=[]
for p in dict.fromkeys([*FACILITY_STYLE,*WEAPON_STYLE]):
    records.append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'role':'actual-approved-local-style-reference','readOnly':True})
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'prompt-catalog.json').write_text(json.dumps({'schemaVersion':1,'scope':'Expedition_v1-P1-camp-and-icons-only','references':records,'sources':sources},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'design-plan.json').write_text(json.dumps({'schemaVersion':1,'campCandidates':list(DESIGNS),'campRuntimeFrames':8,'iconRuntimeFrames':8,'generationKeys':list(sources),'selectionPolicy':'producer selects from actual generated artwork; no user approval claimed','iconOrder':{'gunIcons.sheet':['iconSteadyFlowGun/fixed/normal','iconSteadyFlowGun/fixed/broken','iconPiercingPulseGun/fixed/normal','iconPiercingPulseGun/fixed/broken'],'materialIcons.sheet':['blueprintBasePod/fixed','blueprintRapidPod/fixed','repairBiomass/fixed','lootBag/fixed']},'expectedOutputCanvas':{'camp':[512,512],'icons':[256,256]},'noGenerationSubmittedYet':True},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'generationKeys':list(sources),'references':len(records),'runtimeFrames':16},ensure_ascii=False))

