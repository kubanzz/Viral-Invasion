from pathlib import Path
import json
p=Path(__file__).parent/'prompt-catalog.json';c=json.loads(p.read_text(encoding='utf-8'))
c['sources']['weapon.thunder.r2']={'title':'霆链·裁决铳·三叉修正版','resolution':'1K','follow_up_node':['0a0031f9-6ef7-479f-93f8-b44d8915c04c'],'prompt':'精确修正这把霆链裁决铳，保留原来的奶白圆润枪身、深青握柄、青紫悬浮雷核和同镜头同尺度构图，只修正叉臂数量：当前有四根叉端，必须变成恰好三根！彻底删除雷核右后下方那根额外的短叉，约在原1024图的x816,y631，连同它通向枪身的后侧短支臂和端部奶金圆头一起删除，补回均匀纯白背景。最终只保留上方长叉(x851,y483)、前侧中间叉(x631,y589)、下方长叉(x726,y714)，三根叉臂各有一道青色厚线圈；不要新增第四根叉、短桩、枪管或悬空零件。雷核仍在三叉之间，中心少量暖金高亮，短雷丝只连接三叉，收束在武器包络内不外溢。保持完整短粗握柄、枪尾与奶白外壳，所有材质颜色和比例保持，不改成另一把枪。水平向右侧面略俯视，发射轴+X，不斜放，不画人物/手/文字/UI/外框/弹丸/光晕/阴影。1024方图，单件完整武器，不裁边，所有非实体和孔隙均匀纯白#FFFFFF，无纸纹底、灰底或棋盘格，用于后期真实alpha去底。'}
c['sources']['fx.redblade-ultimate']['follow_up_node']=['8c71ce7d-2fcc-4482-94e7-8b418f2d7971']
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
