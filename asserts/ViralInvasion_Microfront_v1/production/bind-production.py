from pathlib import Path
import json
root=Path(__file__).parent
p=root/'prompt-catalog.json'; c=json.loads(p.read_text(encoding='utf-8'))
node='0656db7c-d203-4f52-b7f3-1bc89506d7ec'
for key,item in c['sources'].items():
 if key.startswith('concept.'): continue
 item['follow_up_node']=[node]
 item['prompt']='全新独立生产素材，只沿用右侧微观前哨的画风与材质，彻底删除整张营地、院落、对比构图和原有场景。不是修改原场景，不是从场景裁图。严格生成以下唯一主体：'+item['prompt']
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
cp=root/'c-prompts.json'; cc=json.loads(cp.read_text(encoding='utf-8')); cc['canvas']=c['canvas']
for key,item in cc['sources'].items():
 item['follow_up_node']=[node]
 item['prompt']='全新独立生产素材，彻底删去营地大场景与对比构图，只画以下指定单体。旧单体参考只提供镜头、比例和功能布局，不继承叶子。'+item['prompt']
cc['continuation'].update(follow_up_node=node,canvas=c['canvas'],doNotSubmitUntilBound=False)
cp.write_text(json.dumps(cc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Production bound to '+node)
