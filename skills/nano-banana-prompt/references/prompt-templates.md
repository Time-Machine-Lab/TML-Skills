# Nano Banana 提示词模板参考

本文档包含Gemini Nano Banana图片生成的详细提示词模板和最佳实践。

## 核心原则

> **描述场景，而不仅仅是列出关键字。** 叙述性、描述性段落几乎总是能生成更好、更连贯的图片。

## 图片生成模板

### 1. 逼真摄影风格

适用于：产品照片、人像、场景摄影

**模板（英文）：**
```
A photorealistic [shot type] of [subject], [action or expression], set in
[environment]. The scene is illuminated by [lighting description], creating
a [mood] atmosphere. Captured with a [camera/lens details], emphasizing
[key textures and details]. The image should be in a [aspect ratio] format.
```

**模板（中文对照）：**
```
一张逼真的[镜头类型]照片，主体是[主题]，[动作或表情]，场景设置在[环境]。
场景由[光线描述]照亮，营造出[氛围]的气氛。
使用[相机/镜头细节]拍摄，强调[关键纹理和细节]。
图片应采用[宽高比]格式。
```

**参数选项：**
- 镜头类型：close-up（特写）、medium shot（中景）、wide shot（广角）、extreme close-up（极致特写）
- 光线：natural light（自然光）、studio lighting（工作室照明）、golden hour（黄金时段）、soft diffused light（柔和漫射光）
- 相机/镜头：85mm portrait lens、macro lens、wide-angle 24mm、50mm prime

---

### 2. 风格化插图和贴纸

适用于：图标、贴纸、UI素材

**模板（英文）：**
```
A [style] sticker of a [subject], featuring [key characteristics] and a
[color palette]. The design should have [line style] and [shading style].
The background must be transparent.
```

**模板（中文对照）：**
```
一个[风格]风格的[主题]贴纸，具有[关键特征]和[配色方案]。
设计应采用[线条风格]和[阴影风格]。
背景必须透明。
```

**参数选项：**
- 风格：kawaii（可爱）、minimalist（极简）、flat design（扁平设计）、3D cartoon（3D卡通）、pixel art（像素艺术）
- 线条风格：bold outlines（粗轮廓）、thin lines（细线条）、no outlines（无轮廓）
- 阴影风格：flat shading（扁平阴影）、soft gradient（柔和渐变）、cell shading（赛璐珞风格）

---

### 3. 文字准确渲染

适用于：Logo、海报、信息图

**模板（英文）：**
```
Create a [image type] for [brand/concept] with the text "[text to render]"
in a [font style]. The design should be [style description], with a
[color scheme].
```

**模板（中文对照）：**
```
为[品牌/概念]创建一个[图片类型]，包含文字"[要渲染的文字]"，
使用[字体风格]。设计应该是[风格描述]，采用[配色方案]。
```

**参数选项：**
- 图片类型：logo、poster、banner、infographic、magazine cover
- 字体风格：serif（衬线）、sans-serif（无衬线）、script（手写体）、bold（粗体）、elegant（优雅）

---

### 4. 产品模型和商业摄影

适用于：电商、广告、品牌宣传

**模板（英文）：**
```
A high-resolution, studio-lit product photograph of a [product description]
on a [background surface/description]. The lighting is a [lighting setup,
e.g., three-point softbox setup] to [lighting purpose]. The camera angle is
a [angle type] to showcase [specific feature]. Ultra-realistic, with sharp
focus on [key detail]. [Aspect ratio].
```

**模板（中文对照）：**
```
一张高分辨率的棚拍商品照片，展示[产品描述]，
放置在[背景表面/描述]上。
灯光采用[灯光设置]以[灯光目的]。
相机角度为[角度类型]，以展示[特定特征]。
超逼真效果，焦点清晰聚焦在[关键细节]上。[宽高比]。
```

---

### 5. 极简风格和负空间设计

适用于：网站背景、演示文稿、营销材料

**模板（英文）：**
```
A minimalist composition featuring a single [subject] positioned in the
[bottom-right/top-left/etc.] of the frame. The background is a vast, empty
[color] canvas, creating significant negative space. Soft, subtle lighting.
[Aspect ratio].
```

**模板（中文对照）：**
```
一幅极简主义构图，画面中只有一个[主题]，
位于画面的[右下角/左上角/等]。
背景是广阔空旷的[颜色]画布，创造出大量负空间。
柔和、微妙的光线。[宽高比]。
```

---

### 6. 漫画分格/故事板

适用于：连续艺术、视觉叙事

**模板（英文）：**
```
Make a [number] panel comic in a [style]. Put the character in a [type of scene].
```

---

### 7. 3D等距风格

适用于：信息图、地图、可视化

**模板（英文）：**
```
A clear 45° top-down isometric miniature 3D cartoon [scene description],
featuring [key elements and landmarks]. Use soft refined textures, 
realistic PBR materials, and soft realistic lighting and shadows.
Clean minimalist composition with a soft solid color background.
[Additional text/UI elements if needed].
```

---

## 图片编辑模板

### 1. 添加/移除元素

```
Using the provided image of [subject], please [add/remove/modify] [element]
to/from the scene. Ensure the change is [description of how the change should integrate].
```

### 2. 局部重绘

```
Using the provided image, change only the [specific element] to [new element/description]. 
Keep everything else in the image exactly the same, preserving the original style, 
lighting, and composition.
```

### 3. 风格迁移

```
Transform the provided photograph of [subject] into the artistic style of 
[artist/art style]. Preserve the original composition but render it with 
[description of stylistic elements].
```

### 4. 多图合成

```
Create a new image by combining the elements from the provided images. Take
the [element from image 1] and place it with/on the [element from image 2].
The final image should be a [description of the final scene].
```

---

## 可用宽高比

| 宽高比 | 适用场景 |
|--------|----------|
| 1:1 | 社交媒体头像、产品图 |
| 16:9 | 横幅、封面、演示文稿 |
| 9:16 | 手机壁纸、Stories |
| 3:2 | 传统照片比例 |
| 4:3 | 屏幕截图、文档 |
| 21:9 | 超宽屏、电影风格 |
| 1:4 / 4:1 | 横幅、长条图 |

---

## 可用分辨率

- `512px` (0.5K) - 仅Gemini 3.1 Flash Image
- `1K` - 默认，适合大多数场景
- `2K` - 高质量
- `4K` - 专业级

---

## 最佳实践

1. **具体描述**：提供详细信息而非泛泛关键词
   - ❌ "奇幻盔甲"
   - ✅ "华丽的精灵板甲，蚀刻着银叶图案，带有高领和猎鹰翅膀形状的肩甲"

2. **提供上下文**：说明图片的用途
   - ❌ "设计徽标"
   - ✅ "为高端极简护肤品牌设计徽标"

3. **迭代优化**：使用后续提示进行微调
   - "这很棒，但你能让光线更暖一些吗？"
   - "保持所有内容不变，但让角色的表情更严肃一些"

4. **分步指令**：复杂场景拆分为多个步骤

5. **语义负提示**：正面描述所需场景
   - ❌ "没有汽车"
   - ✅ "一条没有交通迹象的空旷、荒凉的街道"

6. **控制镜头**：使用摄影术语
   - wide-angle shot、macro shot、low-angle perspective

7. **先生成文字再生成图片**：对于包含文字的图片，先确定文字内容效果更好
