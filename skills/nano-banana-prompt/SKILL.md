---
name: nano-banana-prompt
description: 为Gemini Nano Banana图片生成创建优化的提示词。通过交互式提问确定风格、内容、场景等元素，然后生成符合最佳实践的提示词。当用户需要生成AI图片提示词、Gemini图片生成提示词、或需要帮助撰写图片描述时，应使用此skill。
---

# Nano Banana 提示词生成器

为Gemini Nano Banana图片生成创建高质量、优化的提示词。

## 工作流程

生成提示词时，按以下顺序进行交互式提问，每轮最多问2-3个问题：

### 第一轮：确定图片类型

首先询问用户想要生成的图片类型：

1. **逼真摄影** - 产品照片、人像、场景摄影
2. **插图/贴纸** - 图标、卡通、UI素材
3. **商业设计** - Logo、海报、信息图
4. **产品模型** - 电商、广告、品牌宣传
5. **极简设计** - 背景、负空间构图
6. **3D等距** - 信息图、地图、可视化
7. **漫画/故事板** - 连续艺术、视觉叙事
8. **图片编辑** - 修改现有图片

### 第二轮：收集核心要素

根据图片类型，询问相关的核心要素：

**逼真摄影类：**
- 主题是什么？（人物、物品、场景）
- 希望什么样的镜头？（特写、中景、广角）
- 光线和氛围偏好？（自然光、工作室、黄金时段）

**插图/贴纸类：**
- 主题是什么？
- 风格偏好？（可爱、极简、3D卡通、像素艺术）
- 配色方案？
- 是否需要透明背景？

**商业设计类：**
- 品牌/概念名称？
- 需要包含的文字？
- 设计风格？（现代、复古、优雅）
- 配色偏好？

**产品模型类：**
- 产品描述？
- 背景/场景偏好？
- 要突出的特征？

**图片编辑类：**
- 要进行什么操作？（添加/移除元素、风格迁移、局部修改）
- 具体要修改什么？

### 第三轮：技术参数

询问输出相关的技术参数（可提供默认值）：

- **宽高比**：1:1、16:9、9:16、3:2、4:3、21:9等（默认1:1）
- **分辨率**：512px、1K、2K、4K（默认1K）
- **语言**：英文提示词还是中文（推荐英文以获得最佳效果）

## 提示词生成规则

生成提示词时，遵循以下原则：

1. **描述场景而非列出关键词** - 使用叙述性、描述性段落
2. **具体详细** - 提供尽可能多的细节来控制输出
3. **提供上下文** - 说明图片的用途和目的
4. **使用摄影术语** - 对于逼真风格，使用专业摄影语言
5. **正面描述** - 用"语义负提示"方式正面描述所需场景

## 参考模板

详细的提示词模板请参阅 [references/prompt-templates.md](references/prompt-templates.md)

## 示例交互

**用户**：帮我生成一个图片提示词

**Claude**：好的！首先，您想要生成什么类型的图片？
1. 逼真摄影（产品、人像、场景）
2. 插图/贴纸（图标、卡通）
3. 商业设计（Logo、海报）
4. 产品模型（电商、广告）
5. 极简设计
6. 其他（请描述）

**用户**：逼真摄影，拍一杯咖啡

**Claude**：明白了，咖啡摄影！请告诉我：
- 这是用于什么场景？（社交媒体、咖啡店菜单、广告？）
- 希望什么样的氛围？（温馨舒适、现代简约、复古文艺？）
- 光线偏好？（自然光/工作室灯光/暖色调？）

**用户**：咖啡店菜单用，温馨舒适，自然光

**Claude**：最后几个问题：
- 宽高比偏好？（默认1:1，菜单可能需要4:3或3:2）
- 需要英文还是中文提示词？（英文效果更好）

**用户**：3:2，英文

**Claude**：
```
A photorealistic close-up shot of a steaming latte in a ceramic cup, 
resting on a rustic wooden table in a cozy café setting. 
The scene is illuminated by soft natural morning light streaming through 
a nearby window, creating a warm and inviting atmosphere. 
A delicate latte art pattern adorns the surface of the coffee. 
In the soft-focus background, hints of pastries and a potted plant add depth. 
Captured with an 85mm lens at f/2.8, emphasizing the creamy texture 
of the foam and the gentle steam rising. The image should be in 3:2 format.
```

## 输出格式

生成的提示词应：

1. 以代码块形式输出，便于复制
2. 使用英文（除非用户要求中文）
3. 包含所有收集到的要素
4. 遵循相应图片类型的模板结构
5. 在提示词后简要说明关键元素的作用（可选）
