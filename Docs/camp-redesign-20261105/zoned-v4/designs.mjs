const base={
  id:'zoned-camp',letter:'04',name:'营地 · 分区与尺度重设计',
  subtitle:'连续院落边界 / 单一主通道 / 角色与建筑重新定标',focusX:0,
  stations:[['warehouse',-350,-70],['forge',-350,180],['shop',335,-40],['departure',335,300]],
  residents:[[-224,-31],[-285,184],[385,-2],[280,298],[389,343],[-198,110]],
  player:[0,270],plants:[],extras:[],
  summary:'左侧整备院 · 右上补给院 · 右下出击院；区域之间保留粉色地面与明确入口。'
};
export const designs=[base,{
 ...base,id:'door-scale-check',letter:'比',name:'同屏检查 · 玩家与仓库门洞',
 subtitle:'同一镜头、同一美术、同一尺寸；只把玩家移到仓库门前',
 player:[-382,-46],summary:'玩家站到真实门洞前检查：身体、头盔与门洞宽高关系，而不是只比较图片画布尺寸。'
}];
