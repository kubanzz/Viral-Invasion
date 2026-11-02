/** Adapt existing tactical hints without changing their gameplay meaning. */
export function touchCopy(text: string): string {
  return text.replace(/W\s*A\s*S\s*D\s*移动/gi, '左摇杆移动')
    .replace(/鼠标\s*\/\s*左键/g, '准星 / 施放').replace(/鼠标/g, '准星').replace(/左键/g, '施放按钮')
    .replace(/(?:按\s*)?\bSpace\b/g, '冲刺按钮').replace(/(?:按\s*)?\bQ\b/g, '扫描')
    .replace(/(?:按\s*)?\bE\b/g, '交互').replace(/(?:按\s*)?\bR\b/g, '抗体')
    .replace(/(?:按\s*)?\bEsc\b/g, '暂停').replace(/按\s*([123])/g, '选择工具 $1')
    .replace(/键鼠操作/g, '触屏操作');
}
