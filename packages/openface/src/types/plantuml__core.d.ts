/**
 * @plantuml/core 类型声明
 * 该包没有自带类型定义，手动声明
 */
declare module '@plantuml/core' {
  /**
   * 将 PlantUML 代码渲染为 SVG 字符串
   * @param lines - 代码按行分割的数组
   * @param onSuccess - 渲染成功回调，接收 SVG 字符串
   * @param onError - 渲染失败回调
   * @param options - 渲染选项
   */
  export function renderToString(
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (error: any) => void,
    options?: { dark?: boolean }
  ): void;

  /**
   * 将 PlantUML 代码渲染到 DOM 元素
   * @param lines - 代码按行分割的数组
   * @param elementId - 目标 DOM 元素 ID
   * @param options - 渲染选项
   */
  export function render(
    lines: string[],
    elementId: string,
    options?: { dark?: boolean }
  ): void;
}
