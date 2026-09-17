# 46. ComfyUI 架构深度分析

> **仓库**: [comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI) | **语言**: Python + TypeScript/Vue | **许可证**: GPL-3.0 | **Star**: 78k+

ComfyUI 是当前最强大的开源 AI 内容生成引擎，以**节点图（Node Graph）**为核心范式，支持图像、视频、音频、3D 模型等多种模态的生成与编辑。其架构设计精妙，将复杂的扩散模型推理流程抽象为可组合、可缓存、可复用的有向无环图（DAG）执行模型。

---

## 1. 整体架构分层

ComfyUI 的架构可分为 **五层**：

```
┌─────────────────────────────────────────────────────┐
│                  前端层 (Frontend)                    │
│   ComfyUI_frontend (Vue/TS, 独立仓库, pypi 分发)      │
├─────────────────────────────────────────────────────┤
│                HTTP/WebSocket 服务层                  │
│   server.py (aiohttp) — REST API + WS 推送           │
├─────────────────────────────────────────────────────┤
│              执行引擎层 (Execution Engine)             │
│   execution.py + comfy_execution/                    │
│   PromptExecutor → ExecutionList → TopologicalSort   │
├─────────────────────────────────────────────────────┤
│                节点层 (Node System)                   │
│   nodes.py + comfy_extras/ + custom_nodes/           │
│   NODE_CLASS_MAPPINGS 注册表                          │
├─────────────────────────────────────────────────────┤
│              模型与计算层 (Model & Compute)            │
│   comfy/ — sd.py, model_management.py, samplers.py   │
│   comfy/ldm/, comfy/text_encoders/, comfy/ops.py     │
└─────────────────────────────────────────────────────┘
```

前端（Vue/TypeScript）自 2024 年 8 月起独立为 [ComfyUI_frontend](https://github.com/Comfy-Org/ComfyUI_frontend)，编译后通过 pypi 包 `comfyui-frontend-package` 分发。后端以 Python 为核心，通过 aiohttp 提供 HTTP REST API 和 WebSocket 实时通信。

---

## 2. 节点系统：声明式类型注册

ComfyUI 的核心抽象是**节点（Node）**。每个节点是一个 Python 类，通过类属性和类方法声明其输入输出类型：

```python
class CLIPTextEncode(ComfyNodeABC):
    @classmethod
    def INPUT_TYPES(s) -> InputTypeDict:
        return {
            "required": {
                "text": (IO.STRING, {"multiline": True, "dynamicPrompts": True}),
                "clip": (IO.CLIP, {})
            }
        }
    RETURN_TYPES = (IO.CONDITIONING,)
    FUNCTION = "encode"
    CATEGORY = "model/conditioning"

    def encode(self, clip, text):
        tokens = clip.tokenize(text)
        return (clip.encode_from_tokens_scheduled(tokens),)
```

关键设计要素：
- **`INPUT_TYPES()`**：类方法，声明输入参数的类型、约束（min/max/step）、UI 提示（multiline、tooltip）
- **`RETURN_TYPES`**：声明输出类型，用于类型安全的连线验证
- **`FUNCTION`**：指定执行时调用的方法名，支持同一节点类的多态
- **`CATEGORY`**：前端分类路径，支持多级嵌套
- **`IS_CHANGED` / `fingerprint_inputs`**：可选，用于缓存失效判断
- **`INPUT_IS_LIST`**：控制输入是逐元素还是批量处理
- **`check_lazy_status`**：惰性求值支持，允许节点声明"我不需要这个输入"

节点通过全局注册表 `NODE_CLASS_MAPPINGS`（字典）和 `NODE_DISPLAY_NAME_MAPPINGS` 管理。内置节点在 `nodes.py` 中定义，扩展节点从 `comfy_extras/` 和 `custom_nodes/` 自动发现加载。

ComfyUI 同时支持 **V3 API**（基于 `comfy_api.latest.io` 模块），新 API 使用装饰器和更严格的类型系统，但保持向后兼容。

---

## 3. 执行引擎：DAG 拓扑排序与惰性求值

执行引擎是 ComfyUI 最核心的子系统，位于 `execution.py` 和 `comfy_execution/graph.py`。

### 3.1 PromptExecutor — 执行入口

```python
class PromptExecutor:
    async def execute_async(self, prompt, prompt_id, extra_data, execute_outputs):
        with torch.inference_mode():
            dynamic_prompt = DynamicPrompt(prompt)
            execution_list = ExecutionList(dynamic_prompt, self.caches.outputs, ...)
            for node_id in execute_outputs:
                execution_list.add_node(node_id)

            while not execution_list.is_empty():
                node_id, error, ex = await execution_list.stage_node_execution()
                result, error, ex = await execute(server, dynamic_prompt, caches, node_id, ...)
                if result == ExecutionResult.PENDING:
                    execution_list.unstage_node_execution()
                elif result == ExecutionResult.SUCCESS:
                    execution_list.complete_node_execution()
```

关键流程：
1. 前端提交 JSON 格式的 prompt（节点图的序列化）
2. `DynamicPrompt` 包装原始 prompt，支持运行时动态扩展（ephemeral nodes）
3. `ExecutionList` + `TopologicalSort` 进行依赖分析，确定执行顺序
4. 逐节点执行，支持三种结果：`SUCCESS`、`FAILURE`、`PENDING`（异步/子图展开）

### 3.2 拓扑排序与强链接

`TopologicalSort` 实现了带优先级的拓扑排序：

```python
class TopologicalSort:
    def __init__(self, dynprompt):
        self.pendingNodes = {}
        self.blockCount = {}    # 被多少节点阻塞
        self.blocking = {}      # 阻塞了哪些节点
        self.unblockedEvent = asyncio.Event()
```

它维护一个阻塞计数器，当一个节点的所有上游依赖完成后（`blockCount` 降为 0），该节点变为可执行。使用 `asyncio.Event` 实现异步等待，避免忙等。

### 3.3 惰性求值（Lazy Evaluation）

ComfyUI 支持节点声明 `check_lazy_status` 方法，返回当前实际需要的输入列表。如果某个输入在当前分支不需要（例如条件分支的"否"路径），引擎会跳过对上游节点的计算，显著节省资源。

---

## 4. 缓存体系：多策略中间结果管理

ComfyUI 的缓存系统是其性能的关键保障，位于 `comfy_execution/caching.py` 和 `execution.py` 的 `CacheSet`。

### 4.1 四种缓存策略

| 策略 | 类 | 行为 |
|------|-----|------|
| **Classic** | `HierarchicalCache` | 尽快释放，每次 prompt 结束清理 |
| **LRU** | `LRUCache` | 固定容量，最近最少使用淘汰 |
| **RAM Pressure** | `RAMPressureCache` | 基于系统可用内存动态调整 |
| **None** | `NullCache` | 禁用缓存 |

缓存分为两层：
- **outputs cache**：基于输入签名（`CacheKeySetInputSignature`）缓存节点输出
- **objects cache**：基于节点 ID（`CacheKeySetID`）缓存节点实例

### 4.2 签名计算与祖先追溯

`CacheKeySetInputSignature.get_node_signature()` 递归计算节点的完整输入签名：

```python
async def get_node_signature(self, dynprompt, node_id):
    ancestors, order_mapping = self.get_ordered_ancestry(dynprompt, node_id)
    signature = [self.get_immediate_node_signature(node_id, order_mapping)]
    for ancestor_id in ancestors:
        signature.append(self.get_immediate_node_signature(ancestor_id, order_mapping))
    return to_hashable(signature)
```

签名包含：节点类型、`IS_CHANGED` 返回值、所有输入值（常量直接嵌入，链接引用转为祖先索引）。这确保了**输入不变则输出不变**的缓存正确性。

### 4.3 IS_CHANGED 机制

节点可实现 `IS_CHANGED()` 方法或 `fingerprint_inputs()` 方法，返回一个"变化指纹"。例如，随机种子节点每次返回不同值，确保不被缓存命中。引擎在缓存失效判断时调用此方法。

---

## 5. 内存管理：GPU/CPU 智能调度

`comfy/model_management.py` 实现了精细的显存和内存管理，这是 ComfyUI 能在消费级 GPU 上运行大模型的关键。

### 5.1 VRAM 状态机

```python
class VRAMState(Enum):
    DISABLED = 0    # 无 VRAM
    NO_VRAM = 1     # 极低 VRAM，启用所有省显存选项
    LOW_VRAM = 2
    NORMAL_VRAM = 3
    HIGH_VRAM = 4
    SHARED = 5      # Apple Silicon 等共享内存架构
```

系统启动时检测 GPU 显存大小，自动选择合适的 VRAM 状态。用户可通过 `--lowvram`、`--novram` 等命令行参数覆盖。

### 5.2 模型加载/卸载策略

- **ModelPatcher**：模型的轻量代理，支持 LoRA、ControlNet 等补丁的动态注入/移除
- **权重卸载**：显存不足时，将模型权重卸载到 CPU 内存（offload）
- **文件切片加载**：`memory_management.py` 中的 `TensorFileSlice` 支持直接从 safetensors 文件按需读取权重切片，通过 DMA 直传 GPU，减少内存拷贝
- **量化支持**：`comfy/quant_ops.py` 提供 QuantizedTensor，支持 FP8、INT4 等量化格式
- **PromptModelTracker**：追踪当前 prompt 使用的模型，prompt 结束后释放不再需要的模型

---

## 6. HTTP/WebSocket 服务层

`server.py` 基于 aiohttp 构建，提供两类接口：

### 6.1 REST API

核心端点：
- `POST /prompt`：提交工作流执行
- `GET /object_info`：获取所有节点类型元数据
- `GET /history`：查询执行历史
- `GET /view`：获取生成的图片/视频
- `POST /upload/image`：上传输入图片
- `GET /api/jobs`：查询执行任务状态（支持分页、过滤、排序）
- `POST /free`：释放显存/内存

### 6.2 WebSocket 实时推送

WebSocket 通道推送执行状态事件：
- `execution_start`：执行开始
- `executing`：当前正在执行的节点
- `executed`：节点执行完成（含输出 UI 数据）
- `progress`：进度更新
- `execution_error`：错误信息
- `execution_interrupted`：中断
- `execution_cached`：缓存命中的节点列表

### 6.3 安全机制

- CORS 中间件，限制跨域访问
- Origin 检查中间件，防止 CSRF 攻击（特别是 localhost 场景）
- gzip 压缩中间件
- TLS/SSL 支持（`--tls-keyfile`/`--tls-certfile`）
- 可选的 API 节点禁用（`--disable-api-nodes`），确保完全离线运行

---

## 7. 模型生态：广泛的原生支持

`comfy/sd.py` 是模型加载的核心，导入了 90+ 种文本编码器和数十种 VAE/扩散模型后端：

### 7.1 文本编码器

覆盖 CLIP、T5、LLaMA、Qwen、Gemma 等架构，每种模型族在 `comfy/text_encoders/` 下有独立模块。通过统一的接口适配不同模型的 tokenize → encode 流程。

### 7.2 扩散模型

`comfy/ldm/` 下按模型族组织：SD1.5、SDXL、SD3.5、Flux、HunyuanVideo、Wan、CogVideoX、Mochi、Cosmos 等。每个模型族实现自己的 UNet/DiT 前向传播逻辑。

### 7.3 权重适配器

`comfy/weight_adapter/` 支持 LoRA、LoKR、LoHa、OFT、BOFT、GLoRA 等多种参数高效微调格式的加载和合并。

---

## 8. 文件与路径管理

`folder_paths.py` 实现了统一的模型文件发现系统：

```python
folder_names_and_paths["checkpoints"] = ([os.path.join(models_dir, "checkpoints")], supported_pt_extensions)
folder_names_and_paths["loras"] = ([os.path.join(models_dir, "loras")], supported_pt_extensions)
folder_names_and_paths["vae"] = ([os.path.join(models_dir, "vae")], supported_pt_extensions)
folder_names_and_paths["text_encoders"] = ([os.path.join(models_dir, "text_encoders"), ...], supported_pt_extensions)
# ... 20+ 种模型类别
```

每个类别支持**多个搜索路径**（列表），可配置 `extra_model_paths.yaml` 添加自定义路径。文件列表缓存机制避免每次请求都扫描磁盘。支持的格式包括 `.safetensors`、`.ckpt`、`.pt`、`.bin`、`.pth` 等。

---

## 9. 插件与扩展系统

### 9.1 自定义节点

`custom_nodes/` 目录下的 Python 包自动发现。自定义节点只需导出 `NODE_CLASS_MAPPINGS` 和 `NODE_DISPLAY_NAME_MAPPINGS` 字典即可注册。

### 9.2 子图（Subgraph）

`app/subgraph_manager.py` 支持将一组节点封装为可复用的子图，作为单个节点在工作流中使用。执行引擎原生支持子图展开——节点执行返回新的 DAG 片段，引擎动态注入到执行计划中。

### 9.3 前端扩展

前端支持自定义 JavaScript 扩展（位于 `custom_nodes/` 的 `js/` 子目录），可添加自定义节点 UI、画布操作、快捷键等。

### 9.4 Manager 生态

通过 `--enable-manager` 启用 `comfyui_manager`，提供自定义节点的安装、更新、卸载功能。

---

## 10. 工程实践与设计哲学

### 10.1 设计哲学

- **纯本地、零依赖**：核心不主动下载任何内容，`--disable-api-nodes` 可强制完全离线
- **JSON 即工作流**：工作流可序列化为 JSON，也可从生成的图片中恢复完整工作流和种子
- **异步队列**：支持多个工作流排队执行，带优先级（Ctrl+Shift+Enter 插队）
- **部分重执行**：修改工作流中的某个节点后，只重新执行受影响的节点，利用缓存跳过未变化的部分

### 10.2 发布流程

三仓库联动发布：
1. **ComfyUI Core**：每 2 周一个稳定版本（v0.x.0），patch 版本用于回退修复
2. **Comfy Desktop**：基于最新稳定版构建桌面应用
3. **ComfyUI Frontend**：每 2 周合并到 Core，每日发布可在独立仓库获取

### 10.3 关键技术决策

| 决策 | 原因 |
|------|------|
| aiohttp 而非 FastAPI | 历史选择，WebSocket 支持成熟 |
| 全局注册表模式 | 简化节点发现，但牺牲了命名空间隔离 |
| Python 类方法声明类型 | 避免额外的 schema 定义层，降低节点开发门槛 |
| 拓扑排序而非消息传递 | 确定性执行顺序，便于缓存和调试 |
| safetensors 优先 | 安全（无 pickle 反序列化风险）+ 惰性加载支持 |

### 10.4 局限与挑战

- **全局状态**：`NODE_CLASS_MAPPINGS`、`folder_paths` 等使用全局变量，不利于多实例隔离
- **前端耦合**：WebSocket 事件格式隐式约定，缺乏严格 schema
- **自定义节点兼容性**：核心更新频繁，自定义节点容易因 API 变化而失效（v0.4.0 后引入 patch 版本缓解）
- **单线程 GIL**：GPU 计算受 PyTorch 的 CUDA stream 管理，但 CPU 端的节点执行仍受 GIL 限制

---

## 总结

ComfyUI 的架构精髓在于：**将扩散模型推理的复杂性封装为声明式节点图，通过拓扑排序确定执行顺序，通过智能缓存避免重复计算，通过精细的内存管理适配从消费级到专业级的硬件环境**。这种设计使得非技术用户可以通过可视化界面构建复杂的 AI 工作流，同时为开发者提供了清晰的扩展接口。其 78k+ 的 Star 数和活跃的社区生态，证明了这一架构的成功。
