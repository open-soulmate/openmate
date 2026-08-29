# OpenMate 页面改进计划

## 设计约束
- PageLayout统一框架（sidebar+workspace布局）
- 豁免页面：chat、ai-groups
- 列表优于卡片
- 统一边框#27272a
- 移动端和桌面端一套代码
- 工作区面板50%/256px

## 第一阶段：合并功能雷同的页面

### 1. 器官系统页面合并（23个→5个分组）
这些页面都是OpenSoul的"器官"模块，功能高度雷同，都是连接器配置页面：
- **神经网络组**（nerve/cortex/hippo/reflex/sense）→ 合并为 `/system/neural`
- **循环系统组**（vein/pulse/echo/link）→ 合并为 `/system/circulation`
- **免疫/防御组**（immune/marrow/heredity/gene）→ 合并为 `/system/defense`
- **代谢/能量组**（vital/gland/limb/voice/vision）→ 合并为 `/system/metabolism`
- **意识/灵魂组**（soul/mind/mirror/nest）→ 合并为 `/system/consciousness`

### 2. 管理类页面合并
- admin + permission + enterprise + soma-admin → 合并为 `/admin` 一个页面（标签页切换）
- topology + registry + trajectory → 合并为 `/system` 下的标签页

### 3. 监控类页面合并
- diagnostics + metrics + benchmark + activity → 合并为 `/monitoring`
- timeline + changelog → 合并到 `/activity`

### 4. 知识管理类合并
- knowledge + kb-sharing + knowledge-requests → 保持，但优化布局
- graph → 保留（知识图谱可视化独特功能）

## 第二阶段：逐页完善
合并后的页面逐个优化：
- 统一使用PageLayout
- 数据用Flint+ECharts图表展示
- 列表视图为主
- 搜索+过滤功能

## 执行顺序
1. 先做最简单的合并（管理类）
2. 再做监控类合并
3. 最后做器官系统合并（最复杂）
4. 逐页完善UI
