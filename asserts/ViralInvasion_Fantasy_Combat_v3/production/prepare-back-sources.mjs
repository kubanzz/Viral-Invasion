import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('asserts/ViralInvasion_Fantasy_Combat_v3');
const catalog=JSON.parse(await readFile(root+'/production/prompt-catalog.json','utf8'));
const processing=JSON.parse(await readFile(root+'/production/source-processing.json','utf8'));
const anatomy={slimeMage:'必须保留同一个尖顶斜歪灰葡萄紫菌帽、珊瑚厚帽缘、奶白长菌瓣身体、两只短蹼足、同一粗短菌杖与单个奶白孢子。背视帽子挡住全部正脸，两只眼均不出现；看到菌帽后侧和背部三条大菌褶，施法臂在身体远侧向右上抬起，持杖手相对身体位置合理随角色转动。不要多出另一只菌杖，不要把它变成宽扁帽款。',nestBuilder:'必须保留同一个低伏珊瑚红四足筑巢者、背上两大灰葡萄紫闭合孵化囊与中间粗珊瑚色韧带。后视主要看到双囊背面和短粗后肢，前侧头部转到右上远侧，只允许小块侧脸边缘而不能露出正脸两只眼；保持同一囊瓣数与体积比例，不能把双囊改成单大蛋或独立卵。',swiftLarva:'必须保留同一个细长低伏珊瑚肉粉三节幼体、两对短粗蹼足、单片短紫灰背鳍与细短尖尾。后右视尾尖朝左下近处、头部朝右上远处；看到后脑和背部、绝不能露出朝向观众的正脸双眼。保留原来的三节体型与长短比例，不改成短粗双节胖款。'};
for(const entity of process.argv.slice(2)){
 const src=processing.sources.find(x=>x.key===entity+'/front_right');if(!src)throw new Error('Missing source '+entity);
 catalog.sources[entity+'.back_right']={entity,role:'authored-back-right-master',reference:[path.resolve(root,src.output.path)],sourceReferenceSha256:src.output.sha256,prompt:'任务：以上传的已选定前右单体角色为唯一身份参考，制作这个角色真正旋转后的后右四分之三全身视图，轻俯视，朝画面右上走。不是水平镜像，不是把正面头放到背面，必须看到角色的背部。\n'+anatomy[entity]+'\n严格保持上传图2D软哑光水彩厚涂、暖棕清楚细轮廓、大块粉彩颜料、全部局部配色与角色身体比例。同一角色的后视身份必须一致。站立中性动作，两手两脚完整，躯干不拿发射物。只画一只角色，正方形构图，落脚中点在[50%,85%]，完整主体位于10%至90%区间。\n背景必须均匀纯白#FFFFFF，完全没有地面投影、灰色底影、纸纹、场景、UI、文字、水印、范围圈、粒子和发光，不画前视对照，不画多个候选。轮廓闭合，奶白实体不透明。'};
}
await writeFile(root+'/production/prompt-catalog.json',JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({prepared:process.argv.slice(2).map(x=>x+'.back_right')}));
