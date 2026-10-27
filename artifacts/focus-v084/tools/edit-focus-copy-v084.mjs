import { readFileSync, writeFileSync } from 'node:fs';
const root = '.tools/focus-v084-source/';
const changes = {
  'src/ui/growthHud.ts': [
    ['异常显影让 Q 留下减速轨迹，小队优先围猎显影体。', 'Q 就绪时，准星对准敌体可下达短时围猎指令；对准空地则部署区域。指定目标结束后，小队恢复自动选敌；未指定围猎时优先显影体。'],
    ['鼠标指向敌群，再按 Q，细胞会移动并接触吞噬目标。', 'Q 就绪时，准星对准敌体可短时优先围猎；指向空地则部署区域。围猎受活动范围、路线与原寿命限制，细胞仍须实际赶到并接触咬击。'],
  ],
  'src/game/protocols.ts': [
    ['现在按 Q 标记鼠标区域，召集三只免疫细胞追击、吞噬。', 'Q 就绪时，指敌体短时优先围猎；指空地部署区域，细胞实际移动咬击。'],
    ['搭配免疫细胞优先围猎标记体。', '未指定围猎时，免疫细胞优先追踪显影体。'],
    ['显影联动优先围猎标记体。', 'Q 对准敌体可短时优先围猎；没有指定目标时优先显影体。'],
    ['免疫小队优先追踪标记目标。', '未指定围猎时，免疫小队优先追踪标记目标。'],
  ],
  'src/ui/endlessHud.ts': [
    ['鼠标指向敌群按 Q，细胞会实际移动并吞噬。', 'Q 就绪时，准星对准敌体可下达短时围猎指令；指空地则区域部署。细胞仍须实际移动、接触咬击，目标结束后恢复自动选敌。'],
    ['再按 Q 改指挥点；', 'Q 就绪后再按 Q 改指挥点；'],
  ],
};
for (const [path, pairs] of Object.entries(changes)) {
  let text = readFileSync(root + path, 'utf8');
  for (const [before, after] of pairs) {
    if (!text.includes(before)) throw Error(`Missing copy in ${path}: ${before}`);
    text = text.replace(before, after);
  }
  writeFileSync(root + path, text);
}
