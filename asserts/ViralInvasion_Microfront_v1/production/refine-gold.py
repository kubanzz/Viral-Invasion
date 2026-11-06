from pathlib import Path
import json
p=Path(__file__).parent/'prompt-catalog.json'; c=json.loads(p.read_text(encoding='utf-8'))
c['sources']['summon.golden-antibody.r2']={'title':'金抗体灵幻体·去包边修正版','ratio':'1:1','resolution':'1K','follow_up_node':['5005ef85-a971-46f9-a23e-de1a121b06db'],'prompt':'保留参考图中Y形金抗体的真实金色蛋白形状、两端圆润双叉夹口、短粗下臂、半透明暖金凝胶质感和现有构图，做精确修正：彻底删除环绕主体外侧的整圈灰白半透明包边/灰色壳膜/贴纸轮廓/外描边。金色实体之外直接是均匀纯白底，不存在第二重Y形外轮廓、不存在外框、贴纸边或透明塑料壳；白底无纸纹、灰色杂点、阴影、棋盘格。金色边缘可以保留非常轻柔的金光，光只在实体边缘没有外扩边界线。不要增加五官、人物、翅膀、衣服、道具、文字和UI。单个金抗体灵幻体，清楚Y形，2D手绘宽色块哑光、温润奶金，轻微透光，细金轮廓。正方1024，主体最长轴约70%，完整居中，底端接地基准(512,870)，安全留白。'}
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
