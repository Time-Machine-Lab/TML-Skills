# 📦 技能目录

以下是此代码库中所有可用的 AI 技能列表。

| 技能名称 | 分类 | 描述 | 源码 |
| :--- | :--- | :--- | :--- |
| **Ai Task Constitution** | 其他 | 当任务在 AI 对齐和审查开销上不断停滞时使用，特别是对于设计、架构、跨模块更改或在收敛前需要广泛探索选项的高风险决策。 | [源码](./ai-task-constitution/SKILL.md) |
| **Code Reviewer** | 开发工作流 | | [源码](./code-reviewer/SKILL.md) |
| **Executing Plans** | 开发工作流 | 当你有书面的实施计划，需要在带有审查检查点的单独会话中执行时使用。 | [源码](./executing-plans/SKILL.md) |
| **Finishing A Development Branch** | 其他 | 当实施完成、所有测试通过，且需要决定如何集成工作时使用 - 通过提供合并、PR 或清理的结构化选项来指导完成开发工作。 | [源码](./finishing-a-development-branch/SKILL.md) |
| **Image Generation** | 图片生成 | 通用 AI 图像生成与图像编辑能力。支持文生图和图生图，集成 Nano-banana、Jimeng、Midjourney。用于封面设计、海报/插画生成、风格迁移、参考图重绘、手机壁纸与营销素材生成等场景。先在本技能中选择模型与功能，再按索引加载 references 下的对应模型文档执行。 | [源码](./image-generation/SKILL.md) |
| **Long Article Visualization** | 自媒体内容生成 | 将长文章转换为手绘风格的信息图。基于深度阅读、主题规划和视觉设计，最终调用 image-generation skill 生成图片。 | [源码](./long-article-visualization/SKILL.md) |
| **Nano Banana Prompt** | 其他 | 为Gemini Nano Banana图片生成创建优化的提示词。通过交互式提问确定风格、内容、场景等元素，然后生成符合最佳实践的提示词。当用户需要生成AI图片提示词、Gemini图片生成提示词、或需要帮助撰写图片描述时，应使用此skill。 | [源码](./nano-banana-prompt/SKILL.md) |
| **Ragflow Knowledge** | 其他 | 与 RAGFlow 知识库交互（检索/搜索 和 保存/上传）。当用户希望查询知识库或保存内容到知识库时使用。 | [源码](./ragflow-knowledge/SKILL.md) |
| **Requesting Code Review** | 开发工作流 | 在完成任务、实现主要功能或在合并之前验证工作是否符合要求时使用。 | [源码](./requesting-code-review/SKILL.md) |
| **Skill Creator** | 技能开发 | 创建新技能，修改和改进现有技能，并衡量技能表现。当用户希望从头创建技能、编辑或优化现有技能、运行评估以测试技能、通过方差分析对技能表现进行基准测试，或优化技能描述以提高触发准确性时使用。 | [源码](./skill-creator/SKILL.md) |
| **Spec Governed Coding** | 开发工作流 | 通过结合规范包工件、原子子代理执行和轻量级交付治理的受控“规范优先”工作流来运行编码任务。当用户要求使用此技能完成编码任务并期望 Codex 自动发现当前规范阶段、工作区治理文件和下一个执行路线时使用；或者当编码任务应由 `spec.md`、`plan.md` 和 `tasks.md` 驱动时；又或者当团队希望通过共享的治理文件和任务级运行日志实现可重复的交付，而不是临时路由决策时使用。 | [源码](./spec-governed-coding/SKILL.md) |
| **Spec Subagent Orchestrator** | 开发工作流 | 通过将规范包工件与正确的子代理执行工作流结合来编排复杂工作。当任务在实施前应通过 `spec.md`、`plan.md` 或 `tasks.md` 进行构建时使用；当 Codex 需要决定是否先填补缺失的规范包阶段时；或者当执行应在直接工作、`subagent-driven-development` 和 `subagent-supervisor-constitution` 之间进行路由时使用。在请求将规范与子代理结合、以显式路由运行大型多步交付，或将规范驱动的流程转变为受控执行系统时触发。 | [源码](./spec-subagent-orchestrator/SKILL.md) |
| **Subagent Driven Development** | 开发工作流 | 在当前会话中执行包含独立任务的实施计划时使用。 | [源码](./subagent-driven-development/SKILL.md) |
| **Subagent Supervisor Constitution** | 开发工作流 | 在协调多个子代理执行中/高风险任务时使用，这些任务涉及反复的对齐循环、跨模块更改或昂贵的审查流失；在提交前应用固定的任务章程、严格的所有权边界和强制性的验证关卡。 | [源码](./subagent-supervisor-constitution/SKILL.md) |
| **Test Driven Development** | 开发工作流 | 在实施任何功能或错误修复时，在编写实施代码之前使用。 | [源码](./test-driven-development/SKILL.md) |
| **Using Git Worktrees** | 开发工作流 | 在开始需要与当前工作区隔离的功能开发时，或在执行实施计划之前使用 - 创建具有智能目录选择和安全验证的隔离 git worktrees。 | [源码](./using-git-worktrees/SKILL.md) |
| **Viral Article Rewriter** | 自媒体内容生成 | 爆款长文改写助手。当用户提供长文链接或内容，并要求改写成具有爆款潜质的文章时调用。通过澄清目标、搭建框架、接地气改写和反复迭代，输出高质量的爆款文案。 | [源码](./viral-article-rewriter/SKILL.md) |
| **Writing Plans** | 开发工作流 | 当你有多步任务的规范或要求时，在接触代码之前使用。 | [源码](./writing-plans/SKILL.md) |
| **Xianyu Post Gen** | 自媒体内容生成 | 为闲鱼帖子生成高质量内容与封面方案。用于用户希望基于产品介绍文档，一次性产出可发布的闲鱼标题、正文、封面提示词、竞品借鉴与发布检查清单。支持工作区模式（input/output）、实时检索同类帖子、闲鱼兼容表情清洗（移除 Unicode emoji 并替换为 [] 风格）。 | [源码](./xianyu-post-gen/SKILL.md) |
| **Xiaohongshu Post Generator** | 自媒体内容生成 | 基于种子创意繁衍小红书爆款内容的孵化器。当用户需要围绕特定主题（种子）批量生成具有平台热点属性的标题和文案时调用。 | [源码](./xiaohongshu-post-generator/SKILL.md) |
