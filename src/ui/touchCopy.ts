/** Adapt existing tactical hints without changing their gameplay meaning. */
export function touchCopy(text: string, territory = false): string {
  const contextual = territory ? text.replace(/按\s*(?:F|3)\s*修复心核/gi, '点修复心核')
    .replace(/按\s*(?:F|3)\s*净化(?:组织)?/gi, '点净化组织').replace(/(?:按\s*)?\bF\b/gi, '净化按钮')
    .replace(/按\s*([123])/g, '点技能 $1')
    .replace(/(?:按\s*)?\bB\b/g, '战术建造') : text;
  return contextual.replace(/W\s*A\s*S\s*D\s*移动/gi, '左摇杆移动')
    .replace(/鼠标\s*\/\s*左键/g, '准星 / 施放').replace(/鼠标/g, '准星').replace(/左键/g, '施放按钮')
    .replace(/(?:按\s*)?\bSpace\b/g, '冲刺按钮').replace(/(?:按\s*)?\bQ\b/g, territory ? '驻防' : '扫描')
    .replace(/(?:按\s*)?\bE\b/g, '交互').replace(/(?:按\s*)?\bR\b/g, territory ? '战术栏抗体' : '抗体')
    .replace(/(?:按\s*)?\bEsc\b/g, '暂停').replace(/按\s*([123])/g, '选择工具 $1')
    .replace(/键鼠操作/g, '触屏操作');
}
