# 产品工作区

## 适用场景

- 新建产品
- 导入产品文字资料或素材
- 查看当前产品库

## 默认入口

```bash
node scripts/ops.js product create --name "<产品名>"
node scripts/ops.js product ingest --slug "<slug>" --source "</绝对路径/资料文件>"
node scripts/ops.js product ingest --slug "<slug>" --text "<补充说明>"
node scripts/ops.js product list
node scripts/ops.js product get --slug "<slug>"
```

## 产品工作区原则

- 数据库只存产品基础事实
- 产品详细资料以文件方式存放
- 同一个产品目录下可持续补充材料、素材和任务
- `PRODUCT.md` 负责产品主档
- `PRODUCT-INSIGHT.md` 是产品挖掘工作稿
- 产品挖掘方法依赖专门的提炼指引，而不是一份写死的结果模板

## 进入下一步

- 导入新资料后，先按产品信息提炼指引更新 `PRODUCT-INSIGHT.md`
- 如果产品已经整理好，转到 [strategy-task-work.md](strategy-task-work.md)
