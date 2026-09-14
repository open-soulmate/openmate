# 45. OpenAI Whisper — 语音识别模型架构深度分析

> **仓库**: [openai/whisper](https://github.com/openai/whisper) | **Stars**: 108K+ | **许可证**: MIT
> **论文**: [Robust Speech Recognition via Large-Scale Weak Supervision](https://arxiv.org/abs/2212.04356)

---

## 一、整体架构概览

Whisper 是一个基于 **Transformer Encoder-Decoder (Seq2Seq)** 架构的通用语音识别模型。其核心设计哲学是"大力出奇迹"——通过在 **68万小时** 的弱监督多语言语音数据上进行大规模训练，用单一模型替代传统语音处理流水线中的多个阶段（VAD → 语音识别 → 标点恢复 → 翻译）。

整个系统由五大模块组成：**音频预处理（audio.py）** → **音频编码器（AudioEncoder）** → **文本解码器（TextDecoder）** → **解码策略（decoding.py）** → **时间戳对齐（timing.py）**。模型支持6种规格（tiny到large），参数量从39M到1.55B不等。

---

## 二、十个维度深度分析

### 维度1：音频前端处理（Audio Preprocessing）

音频预处理是整个流水线的第一步，定义在 `audio.py` 中，使用了一组硬编码的超参数：

| 参数 | 值 | 含义 |
|------|------|------|
| `SAMPLE_RATE` | 16000 Hz | 统一重采样到16kHz |
| `N_FFT` | 400 | FFT窗口大小（25ms） |
| `HOP_LENGTH` | 160 | 帧移（10ms） |
| `CHUNK_LENGTH` | 30秒 | 每次处理的最大音频长度 |
| `N_MELS` | 80/128 | Mel滤波器组通道数 |
| `N_SAMPLES_PER_TOKEN` | 320 | 每个音频token对应的采样点数（20ms） |

处理流程：
1. **FFmpeg解码**：调用外部 `ffmpeg` 子进程将任意音频格式解码为16kHz单声道PCM
2. **STFT变换**：使用 `torch.stft` 做短时傅里叶变换，得到复数频谱
3. **Mel滤波**：将功率谱通过预计算的Mel滤波器组投影到Mel频率尺度（滤波器矩阵存储在 `assets/mel_filters.npz` 中，避免依赖librosa）
4. **对数压缩**：`log10` 压缩后做动态范围裁剪（max - 8.0），再线性归一化到 `(log + 4) / 4`

最终输出形状为 `(80, 3000)` 的Mel频谱图——80个Mel通道，3000帧对应30秒音频。这种固定长度的输入设计使得模型可以直接用位置编码处理，无需可变长度机制。

### 维度2：模型规模与参数设计（Model Dimensions）

Whisper 通过 `ModelDimensions` 数据类定义模型结构参数，提供6种规格：

| 规格 | 参数量 | n_audio_state | n_audio_layer | n_text_state | n_text_layer | VRAM |
|------|--------|---------------|---------------|--------------|--------------|------|
| tiny | 39M | 384 | 4 | 384 | 4 | ~1GB |
| base | 74M | 512 | 6 | 512 | 6 | ~1GB |
| small | 244M | 768 | 12 | 768 | 12 | ~2GB |
| medium | 769M | 1024 | 24 | 1024 | 24 | ~5GB |
| large | 1550M | 1280 | 32 | 1280 | 32 | ~10GB |
| turbo | 809M | 1280 | 32 | 1280 | 4 | ~6GB |

**turbo** 是一个特殊设计——它保留了32层编码器但将解码器压缩到4层，实现了接近10倍的速度提升。这说明编码器承担了主要的特征提取工作，解码器相对轻量化也能工作。

### 维度3：音频编码器（AudioEncoder）

```python
class AudioEncoder(nn.Module):
    def __init__(self, n_mels, n_audio_ctx, n_audio_state, n_audio_head, n_audio_layer):
        self.conv1 = Conv1d(n_mels, n_audio_state, kernel_size=3, padding=1)
        self.conv2 = Conv1d(n_audio_state, n_audio_state, kernel_size=3, stride=2, padding=1)
        self.positional_embedding = nn.Embedding(n_audio_ctx, n_audio_state)
        self.blocks = nn.ModuleList([ResidualAttentionBlock(n_audio_state, n_audio_head) for _ in range(n_audio_layer)])
        self.ln_post = LayerNorm(n_audio_state)
```

编码器的前向传播流程：
1. **两层1D卷积**：`conv1` (stride=1) 做通道变换（80→n_state），`conv2` (stride=2) 做时间维度下采样（3000→1500），使用GELU激活
2. **正弦位置编码**：可学习的位置嵌入（`nn.Embedding`），加到卷积输出上
3. **N层 Transformer Block**：每层包含自注意力 + FFN，无因果掩码（双向注意力）
4. **LayerNorm后处理**

关键设计点：卷积层的 stride=2 下采样使得1500个音频token对应30秒音频，每个token覆盖约20ms。这与 `N_SAMPLES_PER_TOKEN = HOP_LENGTH * 2 = 320` 的设计一致。

### 维度4：文本解码器（TextDecoder）

```python
class TextDecoder(nn.Module):
    def __init__(self, n_vocab, n_text_ctx, n_text_state, n_text_head, n_text_layer):
        self.token_embedding = nn.Embedding(n_vocab, n_text_state)
        self.positional_embedding = nn.Parameter(torch.empty(n_text_ctx, n_text_state))
        self.blocks = nn.ModuleList([
            ResidualAttentionBlock(n_text_state, n_text_head, cross_attention=True)
            for _ in range(n_text_layer)
        ])
        self.ln = LayerNorm(n_text_state)
        mask = torch.empty(n_text_ctx, n_text_ctx).fill_(-np.inf).triu_(1)
```

解码器特点：
- **因果自注意力**：上三角掩码（`triu_(1)`）确保每个位置只能看到之前的token
- **交叉注意力**：每个 `ResidualAttentionBlock` 都有 `cross_attn` 层，Query来自解码器，Key/Value来自编码器输出
- **权重共享**：输出logits通过 `x @ token_embedding_weight.T` 计算，与输入embedding共享权重（经典的weight tying技术）
- **KV Cache**：通过 `install_kv_cache_hooks` 方法注册forward hook，在推理时缓存已计算的K/V，避免重复计算

### 维度5：残差注意力块（ResidualAttentionBlock）

这是Transformer的基本构建单元：

```python
class ResidualAttentionBlock(nn.Module):
    def forward(self, x, xa=None, mask=None, kv_cache=None):
        x = x + self.attn(self.attn_ln(x), mask=mask, kv_cache=kv_cache)[0]
        if self.cross_attn:  # 仅解码器有
            x = x + self.cross_attn(self.cross_attn_ln(x), xa, kv_cache=kv_cache)[0]
        x = x + self.mlp(self.mlp_ln(x))
        return x
```

每个Block包含：
- **Pre-Norm自注意力**：LayerNorm → MultiHeadAttention → 残差连接
- **Pre-Norm交叉注意力**（可选）：LayerNorm → CrossAttention → 残差连接，其中K/V来自编码器
- **Pre-Norm FFN**：LayerNorm → Linear → GELU → Linear → 残差连接

注意力实现支持两种模式：标准 `einsum` 和 **SDPA**（`torch.nn.functional.scaled_dot_product_attention`），后者利用FlashAttention等高效内核加速。

### 维度6：Tokenizer与特殊token设计

Whisper使用基于 **tiktoken** 的BPE分词器，词汇表设计非常精巧：

**特殊token序列**（共约100+个）：
- `<|startoftranscript|>` — 序列开始
- `<|zh|>`, `<|en|>`, ... — 99种语言标识
- `<|transcribe|>`, `<|translate|>` — 任务类型
- `<|notimestamps|>` — 禁用时间戳
- `<|0.00|>`, `<|0.02|>`, ..., `<|29.98|>` — 1501个时间戳token（0~30秒，精度20ms）
- `<|nospeech|>` — 静音检测
- `<|startoflm|>`, `<|startofprev|>` — 前缀/提示token

**解码序列构造**：`[SOT] + [语言token] + [任务token] + [notimestamps/时间戳] + 文本token + [EOT]`

这种设计将所有语音处理任务统一为序列预测：语音识别是 `transcribe`，翻译是 `translate`，语言检测只需看前几个token的概率分布。

### 维度7：解码策略（Decoding Strategy）

`decoding.py` 实现了完整的推理管线，由四个组件构成：

1. **Inference（推理引擎）**：`PyTorchInference` 封装了带KV Cache的前向传播。首次调用时安装hook，后续调用只传入最后一个token
2. **SequenceRanker（序列排序）**：`MaximumLikelihoodRanker` 使用对数概率排序，支持长度惩罚（length_penalty）
3. **TokenDecoder（token采样）**：
   - `GreedyDecoder`：贪心解码，temperature=0
   - `BeamSearchDecoder`：束搜索，支持patience参数（arxiv:2204.05424）
4. **LogitFilter（logit过滤）**：
   - `SuppressBlank`：抑制空白输出
   - `SuppressTokens`：抑制特定token（如特殊符号）
   - `TimestampRules`：强制时间戳单调递增

**温度回退机制**：当解码失败（压缩比过高或log概率过低）时，自动升高温度重试，温度序列默认为 `(0.0, 0.2, 0.4, 0.6, 0.8, 1.0)`。

### 维度8：长音频分段处理（Long-form Transcription）

`transcribe.py` 中的 `transcribe()` 函数处理超过30秒的音频：

1. **滑动窗口**：以30秒为单位，stride=30秒（无重叠），逐段处理
2. **VAD启发式**：通过三个阈值判断是否为有效语音段：
   - `compression_ratio_threshold = 2.4`：gzip压缩比过高说明是乱码
   - `logprob_threshold = -1.0`：平均log概率过低说明模型不确定
   - `no_speech_threshold = 0.6`：`<|nospeech|>` token概率过高说明是静音
3. **上下文传递**：`condition_on_previous_text=True` 时，将上一段的输出作为下一段的prompt前缀，保持跨段落一致性
4. **Seek机制**：通过 `seek` 变量跟踪处理进度，失败的段落会被跳过

### 维度9：时间戳对齐与DTW（Word-level Timestamps）

`timing.py` 实现了音频-文本对齐，这是Whisper的一个精巧设计：

1. **Cross-Attention权重提取**：在解码器的交叉注意力层安装hook，提取QK注意力矩阵
2. **对齐头选择**：默认使用解码器后半层的注意力头（通过 `alignment_heads` 缓冲区标记），这些头在训练中自然学会了音频-文本对齐
3. **中值滤波**：对注意力权重施加宽度为7的中值滤波，平滑噪声
4. **DTW对齐**：使用动态时间规整（Dynamic Time Warping）找到最优对齐路径。支持CPU（numba JIT加速）和CUDA（Triton内核）两种实现
5. **词级时间戳**：将token级对齐映射到词级，处理标点符号合并

DTW的CPU实现使用numba `@jit(nopython=True, parallel=True)` 进行并行化，CUDA实现使用自定义Triton kernel。

### 维度10：多任务统一与语言能力

Whisper最核心的创新是**将所有语音任务统一为序列生成**：

- **语音识别**：`<|lang|> <|transcribe|> <|notimestamps|>` + 文本
- **语音翻译**：`<|lang|> <|translate|> <|notimestamps|>` + 英文文本
- **语言检测**：只需看 `<|lang|>` token的概率分布
- **VAD**：`<|nospeech|>` token的概率即为静音概率
- **带时间戳转录**：`<|lang|> <|transcribe|>` + 交替的时间戳和文本token

语言能力方面，支持99种语言，其中约60种的WER低于传统ASR系统。多语言模型（n_vocab ≥ 51865）与英文模型（n_vocab < 51865）通过 `is_multilingual` 属性区分。

---

## 三、架构总结

Whisper的成功验证了几个关键假设：

1. **规模即能力**：68万小时弱监督数据足以训练出通用语音模型
2. **简单即最优**：标准Transformer Seq2Seq架构，无需CTC、注意力对齐等复杂组件
3. **统一即优雅**：一个模型、一套token格式覆盖所有任务
4. **工程即研究**：ffmpeg预处理、tiktoken分词、KV Cache、SDPA支持——工程优化与模型设计同等重要

Whisper的影响不仅在于其性能，更在于它证明了"通用语音基础模型"的可行性，为后续的WhisperLarge-v3、Distil-Whisper、Faster-Whisper等衍生项目奠定了基础。
