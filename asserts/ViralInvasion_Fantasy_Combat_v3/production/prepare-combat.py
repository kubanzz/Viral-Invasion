from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
ACTORS=ROOT.parent/'ViralInvasion_Fantasy_Actors_v2'
STYLE=[str(ACTORS/'sources/enemy/basic/master_v02.png'),str(ACTORS/'sources/immune/beacon/master_v02.png')]
COMMON='''【共用画法】严格匹配参考图的2D软哑光手绘厚涂、水彩颜料边缘、清楚暖棕细轮廓、粉彩大体块。奶白、珊瑚肉粉、灰葡萄紫、灰蓝、薄荷绿，色块简洁，无金属镜面、无霓虹、无写实细密组织。低分辨率32像素仍能识别轮廓与身份。游戏角色素材而非场景插画。
【候选布局】本图只画同一新实体的两款候选，左右各一只完整全身，绝不交叠。两者均前右四分之三轻俯视，面向画面右下。左款中心x=25%，右款x=75%，脚底均约y=85%。每款局限各自半幅，中线留明显白色空隙，顶部四肢完整安全留白。不要编号、文字、标签、分隔线。
【干净输出】均匀纯白#FFFFFF背景，供精确抠图；不要棋盘格、纹理底、场景、地面、烘焙阴影、光效、粒子、武器发射物、范围圈、UI、其他角色或水印。主体轮廓完整闭合，奶白部位保留不透明颜料。'''
DESIGNS={
'immuneCannon':'''【实体】友方免疫弹射炮：一颗生命荚与低矮晶岩底座组成固定设施。它弹射的是玩家本体，因此图内绝不能出现玩家、独立炮弹、弹丸或装填人物。生命荚为奶白厚瓣包裹薄荷绿内部的开放摇篮，斜朝右上固定开放，像短而宽的种荚弹射座。清楚的宽口槽与粗壮柔弹叶片，底部三块短小灰蓝晶岩，晶岩粗圆哑光，无巨型尖塔。整体紧凑，正方形占地、宽高接近，实际地面直径可缩到80世界单位以内。不要传统长金属炮管，不画炮轮，不画面孔。左款：三瓣奶白荚，单片薄荷弹簧叶托；右款：两瓣奶白荚，短粗双叶夹托。底座克制，留出生命荚可压缩、开启、回弹的清楚结构。''',
'slimeMage':'''【实体】感染阵营黏液法师，必须一眼是远程菌类法师。矮小柔软菌柄身体，巨大的偏斜宽檐灰葡萄紫菌帽，珊瑚红厚唇帽缘；帽下是深酒红凹面与两只清楚愤怒琥珀小眼。长而下垂的裙状黏液身体，下端两只短蹼足。画面右侧一只简洁施法前臂抬起，左侧扶一根粗短弯曲菌柄法杖，杖顶仅一个饱满闭合孢子，不发光、不发射，不画独立弹丸。头帽、长身、抬臂/杖形成高低错落远程轮廓，不能画成普通球形病毒或近战蘑菇。左款为尖顶侧歪菌帽+单孢短杖，右款为宽扁菌帽+弯柄短杖。菌柄袍感来自真实菌瓣，不穿布衣、不画人类手指。''',
'nestBuilder':'''【实体】筑巢者，感染阵营背负巨大孵化囊的低重心搬运生物。前侧小珊瑚红身体带两只凶萌琥珀眼，下压眉和小獠牙；四条短粗菌肢低伏撑地，前肢短铲形便于伏地筑巢，禁止额外工具。背侧是宽过头部的大灰葡萄紫孵化囊，囊体由三个粗大饱满瓣组成，肉粉韧带连在本体，不是背包，不是装甲。大背囊是最显著轮廓，身形宽而沉，和瘦高法师明确区别。左款高拱单主囊+两侧小瓣，右款左右双主瓣+中央粗脊。无卵堆、无幼体、无场景，不画背囊里的独立胎儿或透明脏器。''',
'miniNest':'''【实体】敌方小母巢，供筑巢者建设的紧凑低矮孵化设施，不是最终大母巢。必须是封闭含苞的低矮囊状小丘，紫灰外壳三四个大瓣包住珊瑚红核心，底部两三条短粗肉根收拢贴地，轮廓高度不大于宽度。没有巨型开放花冠、没有巨嘴、没有脸、没有长触须、没有人物。六个卵囊由游戏代码另行表现，所以图中不要画任何独立卵囊、蛋、幼体或计数元素。左款：三瓣低矮闭合种荚，顶部一个短开缝；右款：四瓣圆润瘪球，单条珊瑚色接缝。强调闭合腹囊可鼓胀孵化、耗尽收缩。''',
'swiftLarva':'''【实体】敌方高速幼体，身形比普通病毒更小、低矮、流线，追击玩家的小型掠食幼虫。珊瑚肉粉短身体，最多三个大节段，前端较大的头部有两只窄琥珀眼、下压眉和两颗小奶白牙；头朝右下，尾部后掠成短尖。两对极短粗蹼足有前扑追击姿态，不画许多细腿、长触须或人类肢体。宽度约高度1.4倍，轮廓紧凑有速度感，不是巨大蜈蚣，不是史莱姆法师。左款为低伏三节小蝌蚪幼体，右款为更短双节楔形幼体；背部最多两片短灰紫鳍，无发光、无速度线。'''
}
sources={key+'.candidates':{'entity':key,'role':'two-style-candidates','prompt':design+'\n'+COMMON,'style_reference':STYLE} for key,design in DESIGNS.items()}
(ROOT/'production').mkdir(parents=True,exist_ok=True)
(ROOT/'production/prompt-catalog.json').write_text(json.dumps({'schemaVersion':1,'sources':sources},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
contract={'schemaVersion':1,'version':'v0.14','root':ROOT.name,'expectedRuntimeCount':72,'canvas':[512,512],'pivot':[.5,.85],'foot':[256,435.2],'trim':False,'directions':['front_right','back_right'],'leftDirections':'mirrorX of corresponding authored right view','sourceMethod':'Maliang design source + local registered layered/soft-body action baking; not AI per-frame generation','runtimeBudget':{'totalMiB':20,'existingApproxMiB':9.61,'availableApproxMiB':10.39},'entities':[]}
for key,states,height in [('immuneCannon',{'ready':2,'load':2,'fire':3},72),('slimeMage',{'idle':2,'walk':4,'windup':2,'cast':3},74),('nestBuilder',{'idle':2,'walk':4,'build':3},72),('miniNest',{'construction':3,'incubate':2,'depleted':2},64),('swiftLarva',{'idle':2,'run':4,'attack':3},38)]:
    contract['entities'].append({'key':key,'idPrefix':'fantasy.combat.'+key,'directions':['fixed'] if key in ['immuneCannon','miniNest'] else ['front_right','back_right'],'states':states,'suggestedVisibleWorldHeight':height,'groundWorldDiameterMax':80 if key=='immuneCannon' else None,'recommendedRuntimeTexture':256 if key in ['immuneCannon','miniNest'] else 192})
(ROOT/'production/asset-contract.json').write_text(json.dumps(contract,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'sources':list(sources),'contract':'production/asset-contract.json','runtimeFrames':72}))
