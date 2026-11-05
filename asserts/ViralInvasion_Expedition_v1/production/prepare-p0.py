from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
ACTORS=ROOT.parent/'ViralInvasion_Fantasy_Actors_v2'
COMBAT=ROOT.parent/'ViralInvasion_Fantasy_Combat_v3'
COMMON='''【画法与低清轮廓】严格匹配已批准参考的2D软哑光水彩厚涂，暖棕清楚细轮廓，简洁饱满大色块，奶白、薄荷、珊瑚肉粉、灰葡萄紫与灰蓝。不做金属镜面、硬科幻、霓虹或写实血肉。24至32像素仍以完整轮廓区分身份。
【候选布局】左右两款同一实体的完整造型候选，各自只占半幅且不交叠。左款中心25%，右款中心75%，均轻俯视三分之四视角，落脚约85%，每款四周留安全空隙，中线纯白留缝。只画两个，不画文字、编号、标签或分隔线。
【干净输出】均匀纯白#FFFFFF背景供精准抠图，暖棕轮廓闭合，奶白部位实体不透明。绝对没有地面投影、灰影、纸纹背景、场景、网格、人物、射弹、危险圈、护膜、施工UI、文字、粒子或水印。'''
DESIGNS={
'basePod':'''【实体】基础弹射生命荚：严格延续上传的空置奶白生命荚+低矮灰蓝晶岩底座。三片厚壳形成向右上固定开口的摇篮，中间只有深薄荷绿的凹陷叶槽与扁平弹性叶托，里面空置，绝对没有独立球体、种子、蛋、炮弹或玩家。它实际弹射玩家本体，不是发射炮弹。粗圆晶岩底座紧凑，荚体高宽接近，底座宽约整体高度75%，缩到世界80以内仍清楚。左款保持参考原三瓣壳与单弹性叶托，右款稍矮宽、三瓣壳连接更简洁。不要枪管、轮子、机械炮、脸。''',
'rapidPod':'''【实体】速装弹射生命荚，是同一基础弹射荚的快速装填升级，绝不是另一个无关炮。保留奶白三瓣空置摇篮、深薄荷凹陷叶槽、灰蓝低矮晶岩底座、固定向右上开口。速装身份靠背侧一对清楚短薄荷弹性叶片和更短宽的内叶托，轮廓比基础款更轻巧，避免细碎齿轮和霓虹。左款：两片短叶向后上张成V，壳口更开阔；右款：三片短叶层叠、低矮双叶托。升级叶片必须连在荚体，不是独立漂浮物。底座总宽不大于整体高度约0.8，实际世界占地直径≤80。荚槽空置，绝无球/蛋/玩家/炮弹/速度线。''',
'ritualMatron':'''【实体】敌方仪式母体，祭团中央的408HP厚重精英生物，单独一只，非建筑、非人类母亲。饱满低重心的珊瑚红菌囊躯干，深灰葡萄紫三瓣厚菌袍包裹，两只粗大肉瓣前臂环抱胸前，保留施法开合结构。头部是矮宽三瓣圆钝冠状菌萼，面部深酒红凹面、两只凶萌琥珀窄眼。整体宽厚坐伏，像端坐的菌囊祭主，冠、双臂、圆囊躯干三个大形在小尺寸可辨。左款：低宽三冠、双臂合抱、大圆囊；右款：稍高的五瓣短冠、双臂靠身、梨形囊体。不要最终大母巢的巨型开放花冠，不是旧黏液法师的尖顶帽/细长奶白菌柄/法杖。护膜由代码画，图中不画膜、圈或任何特效。''',
'ritualPriest':'''【实体】敌方祭司法师，祭团的204HP远程精英，只画一只，不画三个人围母体的场景。外轮廓必须明显区别旧黏液法师：没有尖顶帽、没有法杖、没有细长奶白菌柄。改为深灰葡萄紫的短宽菌瓣斗篷、三瓣圆钝直立冠状菌帽、珊瑚红短柄身体，两只饱满菌瓣手臂在胸前合抱蓄力，脚下两只短粗暗紫蹼足着地。帽下深酒红面，两只凶萌琥珀窄眼，奶白只用作冠缘与胸前一块大菌褶，不画符文。左款：三瓣向上圆冠、厚袖环抱、倒钟形短袍；右款：宽扇形圆冠、两侧短立瓣、宽袖合拢。头身约1:1.4，体型比厚重仪式母体瘦小但仍沉稳，非巫师人类。朝画面右下前右视，四肢完整，衣褶少。'''
}
sources={}
for key,design in DESIGNS.items():
 item={'entity':key,'role':'two-design-candidates','prompt':design+'\n'+COMMON}
 if key in ['basePod','rapidPod']:item['reference']=[str(COMBAT/'sources/immuneCannon/fixed/master_v01.png')]
 else:item['style_reference']=[str(ACTORS/'sources/enemy/basic/master_v02.png'),str(ACTORS/'sources/mother/master_v01.png')]
 sources[key+'.candidates']=item
(ROOT/'production').mkdir(parents=True,exist_ok=True)
(ROOT/'production/prompt-catalog.json').write_text(json.dumps({'schemaVersion':1,'sources':sources},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'prepared':list(sources)},ensure_ascii=False))
